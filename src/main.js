import amqp from 'amqplib/callback_api'
import winston from 'winston'

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({level: 'silly'})
  ]
})

const url = process.env.MOB_RABBITMQ_URL || 'amqp://localhost'

export function consume (queueName, cb) {
  logger.info(`Client requested to consume queue ${queueName}`)
  logger.debug(`url = ${url}`)

  amqp.connect(url, (err, conn) => {
    if (err) {
      return logger.error('Error connecting to RabbitMQ!')
    }

    logger.info('Connection with RabbitMQ was established successfully!')

    conn.createChannel((err, ch) => {
      if (err) {
        return logger.error('Error creating message channel!')
      }

      const sendAnswer = enqueueAnswer.bind(null, ch, queueName)
      const sendError = enqueueError.bind(null, ch, queueName)

      ch.assertQueue(queueName, {durable: true})
      ch.consume(queueName, req => {
        logger.debug('Consuming new message')
        logger.silly(`content = ${req.content}`)
        try {
          const data = JSON.parse(req.content.toString())
          const message = {
            type: data.type,
            payload: data.payload,
            ok: () => {
              logger.debug('Message ok!')
              ch.ack(req)
            },
            answer: (qn, res) => {
              logger.debug('Consumed message successfully!')
              sendAnswer(data.type, qn, res)
              ch.ack(req)
            },
            error: (err, extra) => {
              logger.error('Error from message consumer!')
              logger.error(`err = ${err}`)
              sendError(err, data, extra)
              ch.ack(req)
            }
          }
          if (data.source) {
            message.source = data.source
          }
          cb(message)
        } catch (err) {
          logger.error('Exception trying to consume message!')
          ch.ack(req)
        }
      })
    })
  })
}

export default {
  consume
}

function enqueueAnswer (ch, source, type, queueName, payload) {
  const message = {
    source,
    type,
    payload
  }
  enqueueMessage(ch, queueName, message)
  logger.debug('Enqueued message answer!')
}

function enqueueError (ch, source, error, data, extra) {
  const message = {
    source,
    error,
    data
  }
  if (extra) {
    message.extra = extra
  }
  enqueueMessage(ch, 'error', message)
  logger.debug('Enqueued message error!')
}

function enqueueMessage (ch, queueName, message) {
  const json = JSON.stringify(message)
  const buf = new Buffer(json)
  ch.assertQueue(queueName, {durable: true})
  ch.sendToQueue(queueName, buf, {persistent: true})
}

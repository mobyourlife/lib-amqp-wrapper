'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.consume = consume;

var _callback_api = require('amqplib/callback_api');

var _callback_api2 = _interopRequireDefault(_callback_api);

var _winston = require('winston');

var _winston2 = _interopRequireDefault(_winston);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var logger = new _winston2.default.Logger({
  transports: [new _winston2.default.transports.Console({ level: 'silly' })]
});

var url = process.env.MOB_RABBITMQ_URL || 'amqp://localhost';

function consume(queueName, cb) {
  logger.info('Client requested to consume queue ' + queueName);
  logger.debug('url = ' + url);

  _callback_api2.default.connect(url, function (err, conn) {
    if (err) {
      return logger.error('Error connecting to RabbitMQ!');
    }

    logger.info('Connection with RabbitMQ was established successfully!');

    conn.createChannel(function (err, ch) {
      if (err) {
        return logger.error('Error creating message channel!');
      }

      var sendAnswer = enqueueAnswer.bind(null, ch, queueName);
      var sendError = enqueueError.bind(null, ch, queueName);

      ch.assertQueue(queueName, { durable: true });
      ch.consume(queueName, function (req) {
        logger.debug('Consuming new message');
        logger.silly('content = ' + req.content);
        try {
          var data = JSON.parse(req.content.toString());
          var message = {
            type: data.type,
            payload: data.payload,
            ok: function ok() {
              logger.debug('Message ok!');
              ch.ack(req);
            },
            answer: function answer(qn, res) {
              logger.debug('Consumed message successfully!');
              sendAnswer(data.type, qn, res);
              ch.ack(req);
            },
            error: function error(err, extra) {
              logger.error('Error from message consumer!');
              logger.error('err = ' + err);
              sendError(err, data, extra);
              ch.ack(req);
            }
          };
          if (data.source) {
            message.source = data.source;
          }
          cb(message);
        } catch (err) {
          logger.error('Exception trying to consume message!');
          ch.ack(req);
        }
      });
    });
  });
}

exports.default = {
  consume: consume
};


function enqueueAnswer(ch, source, type, queueName, payload) {
  var message = {
    source: source,
    type: type,
    payload: payload
  };
  enqueueMessage(ch, queueName, message);
  logger.debug('Enqueued message answer!');
}

function enqueueError(ch, source, error, data, extra) {
  var message = {
    source: source,
    error: error,
    data: data
  };
  if (extra) {
    message.extra = extra;
  }
  enqueueMessage(ch, 'error', message);
  logger.debug('Enqueued message error!');
}

function enqueueMessage(ch, queueName, message) {
  var json = JSON.stringify(message);
  var buf = new Buffer(json);
  ch.assertQueue(queueName, { durable: true });
  ch.sendToQueue(queueName, buf, { persistent: true });
}

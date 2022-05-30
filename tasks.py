from celery import Celery
from os import environ

import rollbar

rollbar_token = environ.get('ROLLBAR_TOKEN')

if rollbar_token != None and environ.get('ROLE_WORKER') != None:
    rollbar.init(rollbar_token, 'celery-imdsv2-test')

app = Celery('tasks')

default_queue_name = "celery"

result_backend = environ['RESULT_BACKEND']
broker_url = environ['BROKER_URL']

is_config_for_sqs = broker_url == 'sqs://'

if is_config_for_sqs:
    region = environ['REGION']
    sqs_queue_url = environ.get('SQS_QUEUE_URL')

    class SQSConfig:
        result_backend = result_backend
        broker_url = broker_url

        broker_transport_options = {
            'region': region,
            'predefined_queues': {
                default_queue_name: {
                    'url': sqs_queue_url,
                }
            }
        }
        celery_default_queue = default_queue_name
        celery_queues = {
            default_queue_name: {"exchange": default_queue_name, "binding_key": default_queue_name}
        }

    celeryconfig = SQSConfig()
else:
    class RedisConfig:
        result_backend = result_backend
        broker_url = broker_url

    celeryconfig = RedisConfig()

app.config_from_object(celeryconfig)

@app.task
def add(x, y):
    return x + y

@app.task
def version():
    return environ.get('TIME_VERSION')

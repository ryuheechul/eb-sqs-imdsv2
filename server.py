from os import environ
from flask import Flask

from tasks import add, version, app as celery_app

app = Flask(__name__)

import os
import rollbar
import rollbar.contrib.flask
from flask import got_request_exception

rollbar_token = environ.get('ROLLBAR_TOKEN')
@app.before_first_request
def init_rollbar():
    """init rollbar module"""
    if rollbar_token != None and environ.get('ROLE_SERVER') != None:
        rollbar.init(
            # access token
            rollbar_token,
            # environment name
            'flask-imdsv2-test',
            # server root directory, makes tracebacks prettier
            root=os.path.dirname(os.path.realpath(__file__)),
            # flask already sets up logging
            allow_logging_basic_config=False)

        # send exceptions from `app` to rollbar, using flask's signal system.
        got_request_exception.connect(rollbar.contrib.flask.report_exception, app)

@app.route('/')
def hello():
    return "ok"

@app.route('/c')
def via_celery():
    return str(
        add.delay(3,5).get()
    )

@app.route('/s')
def via_celery_send_task():
    return str(
        # an alternative way - https://docs.celeryq.dev/en/4.4.0/reference/celery.html#celery.Celery.send_task
        celery_app.send_task('tasks.add', args=(5,3)).get()
    )

@app.route('/v')
def tell_version():
    return str(
        version.delay().get()
    )


@app.route('/vv')
def tell_version_via_send_task():
    return str(
        celery_app.send_task('tasks.version').get()
    )

@app.route('/vvv')
def tell_version_directly():
    return str(
        environ.get('TIME_VERSION')
    )

@app.route('/r')
def region():
    return environ['REGION']

app.run(host='0.0.0.0', port=8000)

from celery import Celery
from os import environ

# https://able.bio/rhett/how-to-set-and-get-environment-variables-in-python--274rgt5
broker_url = environ['BROKER_URL']
app = Celery('tasks', broker=broker_url)

@app.task
def add(x, y):
    return x + y

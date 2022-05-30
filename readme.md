# eb-sqs-imdsv2
## What Is It?
Running [this script][https://gist.github.com/ryuheechul/b2301f0ed9714b98bb410a567b683b2f/c543d4fba8502cc4acf8217140fa5a36d0fe3fbd) caused a service outage once.

Only after the outage, a better method was discovered

In case [with CloudFormation](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/command-options-general.html#:~:text=Valid%20values-,DisableIMDSv1,-Set%20to%20true)
```
- Namespace: aws:autoscaling:launchconfiguration
  OptionName: DisableIMDSv1
  Value: "true"
```

or with CLI

```
aws ec2 modify-instance-metadata-options \
  --region "${region}" --instance-id "${instance_id}" \
  --http-token required \
  --http-endpoint enabled \
  --http-put-response-hop-limit 2 # important
```

The service was running via AWS Elastic Beanstalk depending on a AWS SQS queue.

The purpose of this repo is to reconstruct environment that can:
- provision an environment that simulate the outage (via `--http-put-response-hop-limit 1`)
- simulate `DisableIMDSv1` working fine with
- [Celery](https://docs.celeryq.dev/en/stable/getting-started/introduction.html) functionality with [SQS](https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/sqs.html#broker-sqs)

## Prerequisites
[Install Earthly and its pre-requisites](https://earthly.dev/get-earthly)

## How to Run

`make integration-test` to test locally - using Redis for messaging instead of SQS in this case.

`make deploy` to deploy to AWS via CDK - using SQS for messaging but Redis is still being used as a result backend.
_I assume `aws configure` has been done on the host machine_

`make destroy` to tear down.

`cat Makefile` to see the rest of things you can do.


## What I Learned

### Earthly Is a Fantastic Tool

It was my first opportunity to use Earthly.
Prior to Earthly I always felt awkward use Makefile and Dockerfile together. Now we are talking with Earthfile and it makes the job a lot smoother.
I highly recommend you giving it a go if you haven't already.

### Logs on Elastic Beanstalk
I admit that I didn't even know there is such a thing in Elastic Beanstalk.
I don't find EB exactly a user friendly platform. When Events didn't have much information I debugged things in the dark until I discovered this menu. This is a must.

`EB > Logs > Request Logs > Last 100 Lines (or Full Logs)`
It will show you the missing information (such as docker engine logs) from Event page.

### Arm Version With Graviton Processors
Initially I naively built the image with this `BUILD --platform=linux/arm/v7 --platform=linux/amd64 +push` (yes, I blinly copy-pasted from https://docs.earthly.dev/docs/guides/multi-platform)

And this is the error I've got:

```
ERROR: for server  no matching manifest for linux/arm64/v8 in the manifest list entries

ERROR: for worker  no matching manifest for linux/arm64/v8 in the manifest list entries
no matching manifest for linux/arm64/v8 in the manifest list entries
```

So I changed to `BUILD --platform=linux/arm64 --platform=linux/amd64 +push` and it all worked fine after.

### Trailing comma make the values to be tuple on Python
`region = environ['REGION'],`

expected it to be `"ca-central-1"` (because I didn't notice `,` at the end of the line) but it actually became `("ca-central-1,)`

So if you are copying lines from a JSON-looking dictionary, make sure to delete the trailing comma

### Deno Can Be Good Choice for a Quick and Simple Integration Test
Because it has a built-in testing framework and `fetch` API is available from the standard module.
This gets rid of the needs of having to choose and set up third party framework/library options like a case of working with NodeJS.

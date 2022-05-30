import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CfnOutput } from 'aws-cdk-lib';

// Code is based on https://github.com/aws-samples/aws-elastic-beanstalk-hardened-security-cdk-sample/blob/1ff7c20255e81ab801f30cf49e6ad456ea73378c/lib/elastic_beanstalk_cdk_project-stack.ts
// Although, I made some effort to organize this file, I wouldn't say it's extremely optimized but should be good enough for the current purpose.

interface NetworkConfig {
  vpcName: string,
  vpcCidr: string,
};

class Network extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkConfig) {
    super(scope, id);

    const { vpcName, vpcCidr } = props;

    const vpc = new ec2.Vpc(this, vpcName, {
      natGateways: 1,
      maxAzs: 2,
      cidr: vpcCidr,
      subnetConfiguration: [
        {
          name: 'private-with-nat',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ]
    });

    this.vpc = vpc;
  }
}

interface SecurityGroupsConfig {
  vpc: ec2.Vpc,
};

class SecurityGroups extends Construct {
  public readonly web: ec2.SecurityGroup;
  public readonly lb: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupsConfig) {
    super(scope, id);

    const { vpc } = props;

    // Create Security Group for load balancer
    const lbSecurityGroup = new ec2.SecurityGroup(this, 'LBSG', {
      vpc: vpc,
      description: "Security Group for the Load Balancer",
      securityGroupName: "lb-security-group-name",
      allowAllOutbound: false
    })

    // Determine if HTTP or HTTPS port should be used for LB
    // Giving up on having a port other than 80 - https://serverfault.com/a/981782
    const lbPort = 80
    const webPort = 80

    // Allow Security Group outbound traffic for load balancer
    lbSecurityGroup.addEgressRule(
      ec2.Peer.ipv4('0.0.0.0/0'),
      ec2.Port.tcp(lbPort),
      `Allow outgoing traffic over port ${lbPort}`
    );

    // Allow Security Group inbound traffic for load balancer
    lbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('0.0.0.0/0'),
      ec2.Port.tcp(lbPort),
      `Allow incoming traffic over port ${lbPort}`
    );

    // Create Security Group for web instances
    const webSecurityGroup = new ec2.SecurityGroup(this, 'WebSG', {
      vpc: vpc,
      description: "Security Group for the Web instances",
      securityGroupName: "web-security-group",
      allowAllOutbound: false
    })

    // Allow Security Group outbound traffic over port 80 instances
    webSecurityGroup.addEgressRule(
      ec2.Peer.ipv4('0.0.0.0/0'),
      ec2.Port.tcp(webPort),
      `Allow outgoing traffic over port ${webPort}`
    );

    // Allow Security Group inbound traffic over port 80 from the Load Balancer security group
    webSecurityGroup.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [lbSecurityGroup]
      }),
      ec2.Port.tcp(webPort)
    )

    this.web = webSecurityGroup;
    this.lb = lbSecurityGroup;
  }
}

class SourceBundle extends Construct {
  public readonly appVersionProps: elasticbeanstalk.CfnApplicationVersion;

  constructor(scope: Construct, id: string, app: elasticbeanstalk.CfnApplication) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'EBBucket', {
      bucketName: `verify-eb-sqs-imdsv2`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true
    })

    // Upload the source bundle ZIP file to the deployment bucket
    const appDeploymentZip = new s3Deploy.BucketDeployment(this, "Bucket", {
      sources: [s3Deploy.Source.asset(`${__dirname}/../../../source-bundle`)],
      destinationBucket: bucket
    });

    const zipFileName = 'docker-bundle.zip'

    // Create an app version based on the sample application (from https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/nodejs-getstarted.html)
    const appVersionProps = new elasticbeanstalk.CfnApplicationVersion(this, 'EBAppVer', {
      applicationName: app.applicationName || '',
      sourceBundle: {
        s3Bucket: bucket.bucketName,
        s3Key: zipFileName,
      },
    });

    appVersionProps.node.addDependency(appDeploymentZip)
    appVersionProps.addDependsOn(app)

    this.appVersionProps = appVersionProps;
  }
}

interface OptionSettingPropertyConfig {
  instanceType: string,
  ec2InstanceProfile: iam.CfnInstanceProfile,
  vpc: ec2.Vpc,
  region: string,
  queueUrl: string,
  securityGroups: SecurityGroups;
};

function createOptionSettingProperties(config: OptionSettingPropertyConfig) {
  const {
    instanceType,
    ec2InstanceProfile,
    vpc,
    region,
    queueUrl,
    securityGroups,
  } = config;

  // Get the public and private subnets to deploy Elastic Beanstalk ALB and web servers in.
  const publicSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnets
  const privateWebSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }).subnets

  // A helper function to create a comma separated string from subnets ids
  const createCommaSeparatedList = function(subnets: ec2.ISubnet[]): string {
    return subnets.map((subnet: ec2.ISubnet) => subnet.subnetId).toString()
  }

  const webserverSubnets = createCommaSeparatedList(privateWebSubnets)
  const lbSubnets = createCommaSeparatedList(publicSubnets)

  const { web: webSecurityGroup, lb: lbSecurityGroup } = securityGroups;
  const loadBalancerType = 'application';

  const ebSettings = [
    ['aws:elasticbeanstalk:environment', 'LoadBalancerType', loadBalancerType],                                 // Set the load balancer type (e.g. 'application' for ALB)
    ['aws:autoscaling:launchconfiguration', 'InstanceType', instanceType],                                      // Set instance type for web tier
    ['aws:autoscaling:launchconfiguration', 'IamInstanceProfile', ec2InstanceProfile.attrArn],                  // Set IAM Instance Profile for web tier
    ['aws:autoscaling:launchconfiguration', 'SecurityGroups', webSecurityGroup.securityGroupId],                // Set Security Group for web tier
    ['aws:ec2:vpc', 'VPCId', vpc.vpcId],                                                                        // Deploy resources in VPC created earlier
    ['aws:ec2:vpc', 'Subnets', webserverSubnets],                                                               // Deploy Web tier instances in private subnets
    ['aws:ec2:vpc', 'ELBSubnets', lbSubnets],                                                                   // Deploy Load Balancer in public subnets
    ['aws:elbv2:loadbalancer', 'SecurityGroups', lbSecurityGroup.securityGroupId],                              // Attach Security Group to Load Balancer
    // ['aws:elasticbeanstalk:environment:process:default', 'HealthCheckPath', '/'],                               // this should be default
    ['aws:elasticbeanstalk:environment:process:default', 'Port', '80'],                                         //
    ['aws:elasticbeanstalk:environment:proxy', 'ProxyServer', 'none'],                                          //
    ['aws:elasticbeanstalk:application:environment', 'REGION', region],                                         // Define Env Variable for Region
    ['aws:elasticbeanstalk:application:environment', 'BROKER_URL', 'sqs://'],                                   //
    ['aws:elasticbeanstalk:application:environment', 'SQS_QUEUE_URL', queueUrl],                                //
    ['aws:autoscaling:launchconfiguration', 'DisableIMDSv1', 'true'],                                           // in case of re-enabling IMDSv1 for debugging
    // ['aws:autoscaling:launchconfiguration', 'DisableIMDSv1', 'false'],                                          // in case to re-enable IMDSv1 since simpliy commenting above wouldn't do anything
  ];

  const optionSettingProperties: elasticbeanstalk.CfnEnvironment.OptionSettingProperty[] = ebSettings.map(
    setting => ({ namespace: setting[0], optionName: setting[1], value: setting[2] })
  )

  return optionSettingProperties;
}

interface EBConfig {
  vpc: ec2.Vpc,
  applicationName: string,
  solutionStackName: string,
  instanceType: string,
  queueUrl: string,
  region: string,
};

class EBDeploy extends Construct {
  public readonly endpointUrl: string;
  constructor(scope: Construct, id: string, props: EBConfig) {
    super(scope, id);

    const {
      vpc,
      applicationName,
      solutionStackName,
      instanceType,
      queueUrl,
      region,
    } = props;

    // Create role for the web-instances
    const webtierRole = new iam.Role(this, `${applicationName}-webtier-role`, {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // Add a managed policy for the ELastic Beanstalk web-tier to the webTierRole
    const managedPolicyNames = [
      'AWSElasticBeanstalkWebTier',
      'AWSElasticBeanstalkWorkerTier',
      'AmazonSQSReadOnlyAccess', // for "sqs:GetQueueAttributes"
      'AWSElasticBeanstalkMulticontainerDocker',
      'AmazonSSMManagedInstanceCore',
    ];

    managedPolicyNames
      .map(name => iam.ManagedPolicy.fromAwsManagedPolicyName(name))
      .forEach(managedPolicy => {
        webtierRole.addManagedPolicy(managedPolicy);
      });

    // Create an instance profile for the web-instance role
    const ec2ProfileName = `${applicationName}-EC2WebInstanceProfile`
    const ec2InstanceProfile = new iam.CfnInstanceProfile(this, ec2ProfileName, {
      instanceProfileName: ec2ProfileName,
      roles: [webtierRole.roleName]
    });

    const securityGroups = new SecurityGroups(this, 'SGS', { vpc });

    const optionSettingProperties = createOptionSettingProperties({
      instanceType,
      vpc,
      region,
      securityGroups,
      ec2InstanceProfile,
      queueUrl,
    });

    // Define a new Elastic Beanstalk application
    const app = new elasticbeanstalk.CfnApplication(this, 'App', {
      applicationName: applicationName,
    });

    const { appVersionProps } = new SourceBundle(this, 'SB', app);

    // Create Elastic Beanstalk environment
    const ebEnv = new elasticbeanstalk.CfnEnvironment(this, 'Env', {
      environmentName: `${applicationName}-env`,
      applicationName: applicationName,
      solutionStackName: solutionStackName,
      optionSettings: optionSettingProperties,
      versionLabel: appVersionProps.ref,
      // cnamePrefix: 'use-this-prefix',
    });

    this.endpointUrl = ebEnv.attrEndpointUrl;
  }
}

export class EbSqsImdsv2Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'Queue');

    const network = new Network(this, 'Net', {
      vpcName: 'Vpc',
      vpcCidr: '10.250.250.0/26',
    });

    const deploy = new EBDeploy(this, 'EB', {
      vpc: network.vpc,
      region: this.region,
      queueUrl: queue.queueUrl,
      applicationName: 'celery-over-sqs-w-imdsv2',
      solutionStackName: '64bit Amazon Linux 2 v3.4.16 running Docker',
      instanceType: 't4g.micro',
      // instanceType: 't4g.nano', // nano's memory is too small to build the image on demand
      // instanceType: 't3.micro', // if you wish to use intel based instance
    });

    new CfnOutput(this, 'endpointUrl', {
      value: deploy.endpointUrl,
      description: 'The endpoint of elasticbeanstalk deployment',
    });
  }
}

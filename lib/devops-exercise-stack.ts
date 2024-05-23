// import necessary library 
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class DevopsExerciseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Creates a VPC with a maximum of 2 availability zones.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2
    });

    // Setup ERS cluster
    const cluster = new ecs.Cluster(this, 'WooCommerceCluster', {
      vpc
    });

    // Add secret
    const dbCredentials = new secretsmanager.Secret(this, 'DBCredentials', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password'
      }
    });

    // Setup RDS DB instance
    const rdsDB = new rds.DatabaseInstance(this, 'WooCommerceDB', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      vpc,
      credentials: rds.Credentials.fromSecret(dbCredentials),
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      databaseName: 'woocommerce'
    });

    // S3 bucket for static content in woocommerce
    const s3Bucket = new s3.Bucket(this, 'WooCommerceBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Setup CloudFront distribution to serve content from the S3 bucket.
    const distribution = new cloudfront.Distribution(this, 'WooCommerceDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(s3Bucket)
      }
    });
    
    // Define Fargate task with 4GB memory and 2 vCPUs
    const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'WooCommerceTaskDef', {
      memoryLimitMiB: 4096,
      cpu: 2048
    });

    // Grants S3 permissions to the Fargate task role
    const s3Policy = new iam.PolicyStatement({
      actions: ['s3:*'],
      resources: [s3Bucket.bucketArn, `${s3Bucket.bucketArn}/*`],
    });
    fargateTaskDefinition.addToTaskRolePolicy(s3Policy);

    // Adds a container to the task definition with WooCommerce DB setup, and connect the S3 and Cloudfront
    const container = fargateTaskDefinition.addContainer('WooCommerceContainer', {
      image: ecs.ContainerImage.fromRegistry('wordpress:latest'),
      environment: {
        WORDPRESS_DB_HOST: rdsDB.dbInstanceEndpointAddress,
        WORDPRESS_DB_USER: 'admin',
        WORDPRESS_DB_NAME: 'woocommerce',
        S3_BUCKET_NAME: s3Bucket.bucketName,
        AWS_CLOUDFRONT_DISTRIBUTION: distribution.distributionDomainName
      },
      secrets: {
        WORDPRESS_DB_PASSWORD: ecs.Secret.fromSecretsManager(dbCredentials, 'password')
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'WooCommerce' })
    });

    // Maps container port 80 to host port 80.
    container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP
    });

    // Configures a Fargate service with an application load balancer.
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'WooCommerceService', {
      cluster,
      taskDefinition: fargateTaskDefinition,
      desiredCount: 2,
      publicLoadBalancer: true
    });

    // Configures Route 53 hosted zone and DNS records.
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'customwoocommerce.com'
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // Sets up CloudWatch alarms
    const cpuAlarm = new cloudwatch.Alarm(this, 'CPUUtilizationAlarm', {
      metric: fargateService.service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
    });

    const memoryAlarm = new cloudwatch.Alarm(this, 'MemoryUtilizationAlarm', {
      metric: fargateService.service.metricMemoryUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
    });

    // Output
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionURL', {
      value: distribution.distributionDomainName
    });

    new cdk.CfnOutput(this, 'Route53DomainName', {
      value: hostedZone.zoneName
    });
  }
}

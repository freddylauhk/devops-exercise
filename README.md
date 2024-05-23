# Senior Cloud DevOps Engineer exercise

The Application Engineering team has been developing a custom WooCommerce-based product which will need to be deployed for this initiative. As a member of the DevOps Engineering team your job will be to create the cloud-based infrastructure for supporting this deployment. You will need to create a reference architecture and implement it using modern IaC techniques with documentation for 3-tier application. You can use serverless or container technology to implement this. Its preferred to perform exercise in Typescript CDK or CDKTF. Kindly push architectural diagrams to Github repo along with the code. 

### Custom WooCommerce-Based Product
- WordPress (PHP) based web application
- Relational Database
- Static webpage and assets

### Infrastructure Design
- **3-Tier Model**:
  - **Frontend**: Amazon S3 for static assets + Amazon CloudFront for low-latency CDN
  - **Backend**: Amazon ECS with Fargate for a container-based solution
  - **Database**: Amazon RDS for relational database

- **Additional Infrastructure**:
  - **Networking**: Amazon VPC
  - **DNS**: Amazon Route 53
  - **Monitoring and Alerting**: Amazon CloudWatch Alarms
  - **Load Balancing**: Application Load Balancer

## Architecture
![Architecture Diagram](./BMO_devops_exercise.png)

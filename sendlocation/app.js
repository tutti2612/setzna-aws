const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
  const location = JSON.parse(event.body).data;

  const updateParams = {
    TableName: TABLE_NAME,
    Key: {
      connectionId: event.requestContext.connectionId
    },
    UpdateExpression: "set latitude = :lat, longitude=:lng",
    ExpressionAttributeValues:{
      ":lat": location.latitude,
      ":lng": location.longitude,
    }
  };

  try {
    await ddb.update(updateParams).promise();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to update: ' + JSON.stringify(err) };
  }

  return { statusCode: 200, body: 'Data sent.' };
};

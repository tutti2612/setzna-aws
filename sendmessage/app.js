// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

// だいたい日本の中心である北緯35度地点の緯度、経度
ref: https://easyramble.com/latitude-and-longitude-per-kilometer.html
const SETZNA_LAT = 0.00045066864872880997; // 50mあたりの緯度
const SETZNA_LNG = 0.0005483202357745697; // 50mあたりの経度

exports.handler = async event => {
  let connectionData;
  let selfConnection;

  const getParams = {
    TableName: TABLE_NAME,
    Key: {
      connectionId: event.requestContext.connectionId
    }
  };

  try {
    selfConnection = await ddb.get(getParams).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  const scanParams = { 
    TableName: TABLE_NAME,
    ProjectionExpression: 'connectionId',
    FilterExpression: '(#lat between :low_lat and :high_lat) and (#lng between :low_lng and :high_lng)',
    ExpressionAttributeNames: {
      '#lat': 'latitude',
      '#lng': 'longitude'
    },
    ExpressionAttributeValues: {
      ':low_lat': selfConnection.Item.latitude - SETZNA_LAT,
      ':high_lat': selfConnection.Item.latitude + SETZNA_LAT,
      ':low_lng': selfConnection.Item.longitude - SETZNA_LNG,
      ':high_lng': selfConnection.Item.longitude + SETZNA_LNG
    }
  };
  
  try {
    connectionData = await ddb.scan(scanParams).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  
  const postData = JSON.parse(event.body).data;
  
  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: postData }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};

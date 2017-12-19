const admin = require('firebase-admin')
const datastore = require('@google-cloud/datastore')()
const runtimeVariable = require('./getVariable.js')
var stripe

const stripeKey = 'stripeKey'
const deployment = process.env.FUNCTION_NAME.split('-')[0]
const environment = process.env.FUNCTION_NAME.split('-')[2]

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://' + process.env.GCP_PROJECT + '.firebaseio.com'
});

exports.payOrder = function payOrder(req, res) {

  req.key = stripeKey
  req.deployment = deployment

  runtimeVariable.get(req)
  .then(registerStripe)
  .then(verifyIdToken)
  .then(getCustomerId)
  .then(checkForAndAddToken)
  .then(payCustomerOrder)
  .then(checkForAndRemoveToken)
  .then(removeCart)
  .then(function(request) {
    console.log(request);
    res.status(200).json(request.body)
  })
  .catch(function(error) {
    console.error(error)
    res.status(500).send(error)
  })
}

var registerStripe = function(request) {
  stripe = require("stripe")(request[stripeKey])
  return Promise.resolve(request)
}

var verifyIdToken = function(request) {
  return admin.auth()
  .verifyIdToken(request.headers.authorization)
  .then(function(decodedToken) {
    request.body['decodedToken'] = decodedToken
    return Promise.resolve(request)
  }).catch(function(error) {
    return Promise.reject(error)
  });
}

var getCustomerId = function(request) {
  const userKey = datastore.key(['user', request.body.decodedToken.uid]);
  return datastore.get(userKey)
  .then((results) => {
    if (typeof results[0] === 'undefined') {
      return Promise.reject({Error: "No user found."})
    } else {
      request.body['customerID'] = results[0].customerID
      return Promise.resolve(request)
    }
  }).catch(function(error) {
    return Promise.reject(error)
  })
}

var checkForAndAddToken = function(request) {
    if (request.body.paykey != undefined) {
      return stripe.customers.createSource(request.body.customerID, {source: request.body.paykey})
      .then(function(source) {
        request.body.source = source
        return Promise.resolve(request)
      })
    } else {
      return Promise.resolve(request)
    }
}

var payCustomerOrder = function(request) {

  var payObject = {customer: request.body.customerID}

  if (request.body.source != undefined) {
    payObject.source = request.body.source.id
  }

  return stripe.orders.pay(request.body.orderID, payObject)
  .then(function(paidOrder) {
    request.body.paidOrder = paidOrder
    return Promise.resolve(request)
  })
  .catch(function(error) {
    return Promise.reject(error)
  });
}

var checkForAndRemoveToken = function(request) {
  if (request.body.source != undefined) {
      return stripe.customers.deleteSource(request.body.customerID, request.body.source.id)
      .then(function(source) {
        request.body.removedSource = source
        return Promise.resolve(request)
      })
    } else {
      return Promise.resolve(request)
    }
}

var removeCart = function(request) {
  return ref.child('userCarts').child(request.body.decodedToken.uid).set({})
  .then(function() {
    return Promise.resolve(request)
  })
  .catch(function(error) {
    return Promise.reject(error)
  })
}



/**
 * server/models/index.js - barrel export for the new backend's Mongoose models.
 */
module.exports = {
  AppUser: require('./AppUser'),
  Category: require('./Category'),
  Business: require('./Business'),
  Booking: require('./Booking'),
  Review: require('./Review'),
  Driver: require('./Driver'),
  Vehicle: require('./Vehicle'),
  RideRequest: require('./RideRequest'),
};

/**
 * server/api/v2/reviews/createRideReview.js
 *
 * POST /api/v2/reviews/rides/:id - a customer reviewing the driver after a completed ride. Same
 * real enforcement as the booking review: must be the customer's own ride, must actually be
 * 'trip_completed', one review per ride. The Driver's ratingAvg/ratingCount are recomputed from
 * the real review set, same as Business's.
 */
const RideRequest = require('../../../models/RideRequest');
const Driver = require('../../../models/Driver');
const Review = require('../../../models/Review');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body || {};

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400).json({ error: 'invalid_rating', message: 'rating must be an integer from 1 to 5.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'review_database_unavailable',
      message: 'Reviews are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const ride = await RideRequest.findById(id);
    if (!ride) {
      res.status(404).json({ error: 'ride_not_found', message: 'This ride could not be found.' });
      return;
    }
    if (String(ride.customer) !== String(req.appUser._id)) {
      res.status(403).json({ error: 'not_authorized', message: 'This is not your ride.' });
      return;
    }
    if (ride.status !== 'trip_completed') {
      res.status(409).json({
        error: 'not_completed',
        message: 'You can only review a ride after the trip has been completed.',
      });
      return;
    }
    if (!ride.driver) {
      res.status(409).json({ error: 'no_driver', message: 'This ride has no assigned driver to review.' });
      return;
    }

    const existing = await Review.findOne({ ride: ride._id, author: req.appUser._id });
    if (existing) {
      res.status(409).json({ error: 'already_reviewed', message: 'You already reviewed this ride.' });
      return;
    }

    const driver = await Driver.findById(ride.driver);
    if (!driver) {
      res.status(404).json({ error: 'driver_not_found', message: 'The driver on this ride could not be found.' });
      return;
    }

    await Review.create({
      ride: ride._id,
      author: req.appUser._id,
      subjectType: 'appUser',
      subjectUser: driver.user,
      rating: ratingNum,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 1000) : undefined,
    });

    const stats = await Review.aggregate([
      { $match: { subjectUser: driver.user } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    driver.ratingAvg = stats[0] ? Math.round(stats[0].avg * 10) / 10 : 0;
    driver.ratingCount = stats[0] ? stats[0].count : 0;
    await driver.save();

    res.status(201).json({
      review: { rating: ratingNum, comment },
      driver: { ratingAvg: driver.ratingAvg, ratingCount: driver.ratingCount },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/reviews createRideReview] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};

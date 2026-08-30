/**
 * server/scripts/makeAdmin.js
 *
 * One-off script to grant an account admin access. There is deliberately no API endpoint that
 * can do this (see server/middleware/requireAdmin.js) - the only way to create the first admin,
 * or add another one, is to run this with direct database access, same as
 * server/scripts/seedCategories.js.
 *
 * Usage (from the project root, with MONGODB_URI set):
 *   node server/scripts/makeAdmin.js you@example.com
 */
require('../env').configureEnv();
const { connect, mongoose } = require('../db/mongoose');
const AppUser = require('../models/AppUser');

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node server/scripts/makeAdmin.js <email>');
    process.exitCode = 1;
    return;
  }

  const conn = await connect();
  if (!conn) {
    console.error(
      'MONGODB_URI is not set (or the connection failed). Set MONGODB_URI in your environment (or .env) and try again.'
    );
    process.exitCode = 1;
    return;
  }

  const user = await AppUser.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    { $set: { isAdmin: true } },
    { new: true }
  );

  if (!user) {
    console.error(`No account found with email '${email}'. Sign up first, then run this again.`);
    process.exitCode = 1;
  } else {
    console.log(`'${user.email}' is now an admin.`);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('makeAdmin failed:', err);
  process.exitCode = 1;
});

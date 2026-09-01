const repo = require("./auth.repository");
// NOTE: password hashing + real JWT issuance land in the security phase.
function register({ email, name }) { return repo.upsertUser({ email, name }); }
function login({ email }) {
  const user = repo.getByEmail(email) || repo.upsertUser({ email, name: email });
  return { user, token: "dev-token-" + user.id }; // placeholder token
}
module.exports = { register, login };

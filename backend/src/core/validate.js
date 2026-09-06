// Every request body, query and param goes through a schema. Nothing reaches
// a service layer unvalidated, and the parsed value replaces the raw one.
const validate = ({ body, query, params }) => (req, _res, next) => {
  try {
    if (params) req.params = params.parse(req.params);
    if (query) req.validatedQuery = query.parse(req.query);
    if (body) req.body = body.parse(req.body);
    next();
  } catch (e) { next(e); }
};
module.exports = { validate };

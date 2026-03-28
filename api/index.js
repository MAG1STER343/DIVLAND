const app = require("../server/src/index.js");

module.exports = (req, res) => {
  return app(req, res);
};

/** Register every REST route on the app. Order matters only between
 *  routes that share prefixes — this module keeps them grouped by
 *  concern. */

module.exports = function registerRoutes(app, deps) {
  require('./health')(app, deps);
  require('./installer')(app, deps);
  require('./auth')(app, deps);
  require('./users')(app, deps);
  require('./webhooks')(app, deps);
  require('./agents')(app, deps);
  require('./audit')(app, deps);
  require('./alerts')(app, deps);
  require('./groups')(app, deps);
  require('./bulk')(app, deps);
  require('./schedules')(app, deps);
  require('./scripts')(app, deps);
  require('./backup')(app, deps);
  require('./push')(app, deps);
};

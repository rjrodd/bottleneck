// Generated by CoffeeScript 1.10.0
(function() {
  var Bottleneck, MIDDLE_PRIORITY, NB_PRIORITIES,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    slice = [].slice;

  NB_PRIORITIES = 10;

  MIDDLE_PRIORITY = 5;

  Bottleneck = (function() {
    var e;

    Bottleneck.strategy = Bottleneck.prototype.strategy = {
      LEAK: 1,
      OVERFLOW: 2,
      OVERFLOW_PRIORITY: 4,
      BLOCK: 3
    };

    Bottleneck.Cluster = Bottleneck.prototype.Cluster = require("./Cluster");

    Bottleneck.DLList = Bottleneck.prototype.DLList = require("./DLList");

    Bottleneck.Promise = Bottleneck.prototype.Promise = (function() {
      var error1;
      try {
        return require("bluebird");
      } catch (error1) {
        e = error1;
        return typeof Promise !== "undefined" && Promise !== null ? Promise : function() {
          throw new Error("Bottleneck: install 'bluebird' or use Node 0.12 or higher for Promise support");
        };
      }
    })();

    function Bottleneck(maxNb, minTime, highWater, strategy, rejectOnDrop) {
      this.maxNb = maxNb != null ? maxNb : 0;
      this.minTime = minTime != null ? minTime : 0;
      this.highWater = highWater != null ? highWater : -1;
      this.strategy = strategy != null ? strategy : Bottleneck.prototype.strategy.LEAK;
      this.rejectOnDrop = rejectOnDrop != null ? rejectOnDrop : false;
      this.schedulePriority = bind(this.schedulePriority, this);
      this.submitPriority = bind(this.submitPriority, this);
      this.submit = bind(this.submit, this);
      this._nextRequest = Date.now();
      this._nbRunning = 0;
      this._queues = this._makeQueues();
      this._timeouts = [];
      this._unblockTime = 0;
      this.penalty = (15 * this.minTime) || 5000;
      this.interrupt = false;
      this.reservoir = null;
      this.limiter = null;
      this.events = {};
    }

    Bottleneck.prototype._trigger = function(name, args) {
      var dropped;
      if (name === "dropped" && this.rejectOnDrop) {
        dropped = args[0];
        dropped.cb(new Error("This job has been dropped."));
      }
      return setTimeout(((function(_this) {
        return function() {
          var ref;
          return (ref = _this.events[name]) != null ? ref.forEach(function(e) {
            return e.apply({}, args);
          }) : void 0;
        };
      })(this)), 0);
    };

    Bottleneck.prototype._makeQueues = function() {
      var i, j, ref, results;
      results = [];
      for (i = j = 1, ref = NB_PRIORITIES; 1 <= ref ? j <= ref : j >= ref; i = 1 <= ref ? ++j : --j) {
        results.push(new Bottleneck.prototype.DLList());
      }
      return results;
    };

    Bottleneck.prototype.chain = function(limiter) {
      this.limiter = limiter;
      return this;
    };

    Bottleneck.prototype.isBlocked = function() {
      return this._unblockTime >= Date.now();
    };

    Bottleneck.prototype._sanitizePriority = function(priority) {
      var sProperty;
      sProperty = ~~priority !== priority ? MIDDLE_PRIORITY : priority;
      if (sProperty < 0) {
        return 0;
      } else if (sProperty > NB_PRIORITIES - 1) {
        return NB_PRIORITIES - 1;
      } else {
        return sProperty;
      }
    };

    Bottleneck.prototype._find = function(arr, fn) {
      var i, j, len, x;
      for (i = j = 0, len = arr.length; j < len; i = ++j) {
        x = arr[i];
        if (fn(x)) {
          return x;
        }
      }
      return [];
    };

    Bottleneck.prototype.nbQueued = function(priority) {
      if (priority != null) {
        return this._queues[this._sanitizePriority(priority)].length;
      } else {
        return this._queues.reduce((function(a, b) {
          return a + b.length;
        }), 0);
      }
    };

    Bottleneck.prototype._getFirst = function(arr) {
      return this._find(arr, function(x) {
        return x.length > 0;
      });
    };

    Bottleneck.prototype._conditionsCheck = function() {
      return (this._nbRunning < this.maxNb || this.maxNb <= 0) && ((this.reservoir == null) || this.reservoir > 0);
    };

    Bottleneck.prototype.check = function() {
      return this._conditionsCheck() && (this._nextRequest - Date.now()) <= 0;
    };

    Bottleneck.prototype._tryToRun = function() {
      var done, index, next, queued, wait;
      if (this._conditionsCheck() && (queued = this.nbQueued()) > 0) {
        this._nbRunning++;
        if (this.reservoir != null) {
          this.reservoir--;
        }
        wait = Math.max(this._nextRequest - Date.now(), 0);
        this._nextRequest = Date.now() + wait + this.minTime;
        next = (this._getFirst(this._queues)).shift();
        if (queued === 1) {
          this._trigger('empty', []);
        }
        done = false;
        index = -1 + this._timeouts.push(setTimeout((function(_this) {
          return function() {
            var completed;
            completed = function() {
              var ref;
              if (!done) {
                done = true;
                delete _this._timeouts[index];
                _this._nbRunning--;
                _this._tryToRun();
                if (!_this.interrupt) {
                  return (ref = next.cb) != null ? ref.apply({}, Array.prototype.slice.call(arguments, 0)) : void 0;
                }
              }
            };
            if (_this.limiter != null) {
              return _this.limiter.submit.apply(_this.limiter, Array.prototype.concat(next.task, next.args, completed));
            } else {
              return next.task.apply({}, next.args.concat(completed));
            }
          };
        })(this), wait));
        return true;
      } else {
        return false;
      }
    };

    Bottleneck.prototype.submit = function() {
      var args;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return this.submitPriority.apply({}, Array.prototype.concat(MIDDLE_PRIORITY, args));
    };

    Bottleneck.prototype.submitPriority = function() {
      var args, cb, j, job, priority, reachedHighWaterMark, shifted, task;
      priority = arguments[0], task = arguments[1], args = 4 <= arguments.length ? slice.call(arguments, 2, j = arguments.length - 1) : (j = 2, []), cb = arguments[j++];
      job = {
        task: task,
        args: args,
        cb: cb
      };
      priority = this._sanitizePriority(priority);
      reachedHighWaterMark = this.highWater >= 0 && this.nbQueued() === this.highWater && !this.check();
      if (this.strategy === Bottleneck.prototype.strategy.BLOCK && (reachedHighWaterMark || this.isBlocked())) {
        this._unblockTime = Date.now() + this.penalty;
        this._nextRequest = this._unblockTime + this.minTime;
        this._queues = this._makeQueues();
        this._trigger('dropped', [job]);
        return true;
      } else if (reachedHighWaterMark) {
        shifted = this.strategy === Bottleneck.prototype.strategy.LEAK ? (this._getFirst(this._queues.slice(priority).reverse())).shift() : this.strategy === Bottleneck.prototype.strategy.OVERFLOW_PRIORITY ? (this._getFirst(this._queues.slice(priority + 1).reverse())).shift() : this.strategy === Bottleneck.prototype.strategy.OVERFLOW ? job : void 0;
        if (shifted != null) {
          this._trigger('dropped', [shifted]);
        }
        if ((shifted == null) || this.strategy === Bottleneck.prototype.strategy.OVERFLOW) {
          return reachedHighWaterMark;
        }
      }
      this._queues[priority].push(job);
      this._tryToRun();
      return reachedHighWaterMark;
    };

    Bottleneck.prototype.schedule = function() {
      var args;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return this.schedulePriority.apply({}, Array.prototype.concat(MIDDLE_PRIORITY, args));
    };

    Bottleneck.prototype.schedulePriority = function() {
      var args, priority, task, wrapped;
      priority = arguments[0], task = arguments[1], args = 3 <= arguments.length ? slice.call(arguments, 2) : [];
      wrapped = function(cb) {
        return (task.apply({}, args)).then(function() {
          var args;
          args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
          return cb.apply({}, Array.prototype.concat(null, args));
        })["catch"](function() {
          var args;
          args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
          return cb.apply({}, Array.prototype.concat({}, args));
        });
      };
      return new Bottleneck.prototype.Promise((function(_this) {
        return function(resolve, reject) {
          return _this.submitPriority.apply({}, Array.prototype.concat(priority, wrapped, function() {
            var args, error;
            error = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
            return (error != null ? reject : resolve).apply({}, args);
          }));
        };
      })(this));
    };

    Bottleneck.prototype.changeSettings = function(maxNb, minTime, highWater, strategy) {
      this.maxNb = maxNb != null ? maxNb : this.maxNb;
      this.minTime = minTime != null ? minTime : this.minTime;
      this.highWater = highWater != null ? highWater : this.highWater;
      this.strategy = strategy != null ? strategy : this.strategy;
      while (this._tryToRun()) {}
      return this;
    };

    Bottleneck.prototype.changePenalty = function(penalty) {
      this.penalty = penalty != null ? penalty : this.penalty;
      return this;
    };

    Bottleneck.prototype.changeReservoir = function(reservoir) {
      this.reservoir = reservoir;
      while (this._tryToRun()) {}
      return this;
    };

    Bottleneck.prototype.incrementReservoir = function(incr) {
      if (incr == null) {
        incr = 0;
      }
      this.changeReservoir(this.reservoir + incr);
      return this;
    };

    Bottleneck.prototype.on = function(name, cb) {
      if (this.events[name] != null) {
        this.events[name].push(cb);
      } else {
        this.events[name] = [cb];
      }
      return this;
    };

    Bottleneck.prototype.stopAll = function(interrupt) {
      var a, j, len, ref;
      this.interrupt = interrupt != null ? interrupt : this.interrupt;
      ref = this._timeouts;
      for (j = 0, len = ref.length; j < len; j++) {
        a = ref[j];
        clearTimeout(a);
      }
      this._tryToRun = function() {};
      return this.check = this.submit = this.submitPriority = this.schedule = this.schedulePriority = function() {
        return false;
      };
    };

    return Bottleneck;

  })();

  module.exports = Bottleneck;

}).call(this);

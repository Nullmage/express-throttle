"use strict";

// The throttling is done using the "token bucket" method
// https://en.wikipedia.org/wiki/Token_bucket

var options = require("./options");

// Default token storage (memory-bounded LRU cache)
var MemoryStore = require("./memory-store");

function Throttle(opts) {
	opts = options.parse(opts);
	var refill;

	if (opts.rate.fixed) {
		refill = function(bucket, t) {
			bucket.window_start = bucket.window_start || t;

			var window1 = Math.floor((bucket.mtime - bucket.window_start) / bucket_settings.period);
			var window2 = Math.floor((t - bucket.window_start) / bucket_settings.period);

			if (window1 == window2) {
				return 0;
			} else {
				bucket.window_start = t;
				return bucket_settings.size;
			}
		};
	} else {
		var rate = opts.rate.amount / opts.rate.period;
		refill = function(bucket, t) {
			return rate * (t - bucket.mtime);
		};
	}
	
	var bucket_settings = {
		"size": opts.burst || opts.rate.amount,
		"period": opts.rate.period,
		"refill": refill
	};

	var store = opts.store || new MemoryStore(10000);

	// key function, used to identify the client we are going to throttle
	var key_func = opts.key || function(req) {
		return req.headers["x-forwarded-for"] || req.connection.remoteAddress;
	};

	var cost_func;

	// cost function, calculates the number of tokens to be subtracted per request
	if (typeof(opts.cost) == "number") {
		cost_func = function() { return opts.cost; };
	} else if (typeof(opts.cost) == "function") {
		cost_func = opts.cost;
	} else {
		cost_func = function() { return 1; };
	}

	var on_allowed = opts.on_allowed || function(req, res, next, bucket) { // eslint-disable-line no-unused-vars
		next();
	};

	var on_throttled = opts.on_throttled || function(req, res, next, bucket) { // eslint-disable-line no-unused-vars
		res.status(429).end();
	};
	
	return function(req, res, next) {
		var key = key_func(req);
		var cost = cost_func(req);

		store.get(key, function(err, bucket) {
			if (err) {
				return next(err);
			}

			var t = Date.now();
			bucket = bucket || create_bucket(bucket_settings, t);
			var is_allowed = update_bucket(bucket, bucket_settings, cost, t);

			store.set(key, bucket, function(err) {
				if (err) {
					return next(err);
				}

				if (is_allowed) {
					on_allowed(req, res, next, bucket);
				} else {
					on_throttled(req, res, next, bucket);
				}
			});
		});
	};
}

function create_bucket(settings, ctime) {
	return {
		// current token count 
		"tokens": settings.size,
		// last modification time
		"mtime": ctime,
		// reset time (time left in this period)
		"rtime": ctime + settings.period
	};
}

function update_bucket(bucket, settings, cost, t) {
	// Apply the refill first so it doesn't cancel out with the tokens we are
	// about to drain
	bucket.tokens = clamp_max(bucket.tokens + settings.refill(bucket, t), settings.size);
	bucket.mtime = t;
	bucket.rtime = Math.abs(settings.period - t % settings.period);

	if (bucket.tokens >= cost) {
		bucket.tokens -= cost;
		return true;
	} else {
		// Not enough tokens, don't remove anything
		return false;
	}
}

function clamp_max(value, max) {
	return value > max ? max : value;
}

module.exports = Throttle;
"use strict";

// The throttling is done using the "token bucket" method
// https://en.wikipedia.org/wiki/Token_bucket

var options = require("./options");

function Throttle(opts) {
	opts = options.parse(opts);

	return function(req, res, next) {
		var key = opts.key(req);
		var cost = opts.cost(req);

		opts.store.get(key, function(err, bucket) {
			if (err) {
				return next(err);
			}

			var t = Date.now();
			bucket = bucket || opts.create_bucket(t);
			var tokens = opts.refill_bucket(t, bucket);
			bucket.tokens = clamp_max(bucket.tokens + tokens, opts.burst);
			var is_allowed = drain_tokens(bucket, cost);
			bucket.mtime = t;

			opts.store.set(key, bucket, function(err) {
				if (err) {
					return next(err);
				}

				if (is_allowed) {
					opts.on_allowed(req, res, next, bucket);
				} else {
					opts.on_throttled(req, res, next, bucket);
				}
			});
		});
	};
}

function drain_tokens(bucket, cost) {
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
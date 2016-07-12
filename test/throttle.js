"use strict";

var tap = require("tap");
var express = require("express");
var request = require("supertest");

var MemoryStore = require("../lib/memory-store");
var throttle = require("../lib/throttle");

function close_to(value, target, delta = 0.001) {
	return Math.abs(value - target) <= delta;
}

function create_app() {
	var app = express();

	app.get("/", throttle.apply(null, arguments), function(req, res) {
		res.status(200).json(req.connection.remoteAddress);
	});

	return app;
}

tap.test("passthrough...", function(t) {
	t.plan(3);

	function verify(st, end) {
		return function(err, res) {
			st.equal(res.status, 200);

			if (end) {
				st.end();
			}
		};
	}

	t.test("...2 requests with enough gap @ rate 5/s", function(st) {
		var app = create_app({ "rate": "5/s", "burst": 1 });
		request(app).get("/").end(verify(st));
		setTimeout(function() {
			request(app).get("/").end(verify(st, true));
		}, 250); // add 50ms to allow some margin for error
	});

	t.test("...2 requests with enough gap @ rate 5/2s", function(st) {
		var app = create_app({ "rate": "5/2s", "burst": 1 });
		request(app).get("/").end(verify(st));
		setTimeout(function() {
			request(app).get("/").end(verify(st, true));
		}, 450);
	});

	t.test("...2 requests with enough gap @ rate 5/s:fixed", function(st) {
		var app = create_app({ "rate": "5/s:fixed", "burst": 1 });
		request(app).get("/").end(verify(st));
		setTimeout(function() {
			request(app).get("/").end(verify(st, true));
		}, 1050);
	});
});

tap.test("throttle...", function(t) {
	t.plan(3);

	function verify(st, end) {
		return function(err, res) {
			st.equal(res.status, 429);

			if (end) {
				st.end();
			}
		};
	}

	t.test("...2 requests without enough gap @ rate 5/s", function(st) {
		var app = create_app({ "rate": "5/s", "burst": 1 });
		request(app).get("/").end(function() {});
		setTimeout(function() {
			request(app).get("/").end(verify(st, true));
		}, 150);
	});

	t.test("...2 requests without enough gap @ rate 5/2s", function(st) {
		var app = create_app({ "rate": "5/2s", "burst": 1 });
		request(app).get("/").end(function() {});
		setTimeout(function() {
			request(app).get("/").end(verify(st, true));
		}, 350);
	});

	t.test("...2 requests without enough gap @ rate 5/s:fixed", function(st) {
		var app = create_app({ "rate": "5/s:fixed", "burst": 1 });
		request(app).get("/").end(function() {});
		setTimeout(function() {
			request(app).get("/").end(verify(st, true));
		}, 950);
	});
});

tap.test("custom store...", function(t) {
	t.plan(3);
	
	t.test("...that fails to retrieve", function(st) {
		function FailStore() { }
		FailStore.prototype.get = function(key, callback) {
			callback(new Error("failed to get"));
		};

		// No need to implement set, as we won't reach that code
		var app = express();
		app.get("/", throttle({ "rate": "1/s", "store": new FailStore() }),
		function(err, req, res, next) { // eslint-disable-line no-unused-vars
			st.assert(err instanceof Error);
			res.status(500).end();
		});

		request(app).get("/").end(function() { st.end(); });
	});

	t.test("...that fails to save", function(st) {
		function FailStore() { }
		FailStore.prototype.get = function(key, callback) { callback(null, {}); };
		FailStore.prototype.set = function(key, value, callback) {
			callback(new Error("failed to set"));
		};

		var app = express();
		app.get("/", throttle({ "rate": "1/s", "store": new FailStore() }),
		function(err, req, res, next) { // eslint-disable-line no-unused-vars
			st.assert(err instanceof Error);
			res.status(500).end();
		});

		request(app).get("/").end(function() { st.end(); });
	});

	t.test("...that works", function(st) {
		var store = new MemoryStore();
		var app = create_app({ "rate": "1/s", "store": store });

		request(app).get("/").end(function(err, res) {
			st.equal(res.status, 200);
			store.get(res.body, function(err, bucket) {
				st.ok(bucket);
				st.end();
			});
		});
	});
});

tap.test("custom key function", function(t) {
	var store = new MemoryStore();
	var custom_key = "custom_key";
	var app = create_app({
		"rate": "1/s",
		"store": store,
		"key": function() { return custom_key; }
	});

	request(app).get("/").end(function(err, res) {
		t.equal(res.status, 200);
		store.get(custom_key, function(err, bucket) {
			t.ok(bucket);
			t.end();
		});
	});
});

tap.test("custom cost value", function(t) {
	var store = new MemoryStore();
	var app = create_app({
		"rate": "1/s",
		"burst": 5,
		"store": store,
		"cost": 3
	});

	request(app).get("/").end(function(err, res) {
		store.get(res.body, function(err, bucket) {
			t.equal(res.status, 200);
			t.assert(close_to(bucket.tokens, 2));

			request(app).get("/").end(function(err, res) {
				t.equal(res.status, 429);
				t.end();
			});
		});
	});
});

tap.test("custom cost function passthrough", function(t) {
	var app = express();
	var store = new MemoryStore();

	app.get("/:admin", throttle({
		"burst": 5,
		"rate": "1/s",
		"store": store,
		"cost": function(req) {
			if (req.params.admin == "yes") {
				return 0;
			} else {
				return 3;
			}
		}
	}), function(req, res) {
		res.status(200).json(req.connection.remoteAddress);
	});

	request(app).get("/yes").end(function(err, res) {
		store.get(res.body, function(err, bucket) {
			t.equal(res.status, 200);
			t.assert(close_to(bucket.tokens, 5));

			request(app).get("/no").end(function(err, res) {
				store.get(res.body, function(err, bucket) {
					t.equal(res.status, 200);
					t.assert(close_to(bucket.tokens, 2));
					
					request(app).get("/no").end(function(err, res) {
						t.equal(res.status, 429);
						t.end();
					});
				});
			});
		});
	});
});

tap.test("custom on_allowed function", function(t) {
	var app = create_app({
		"rate": "1/s",
		"on_allowed": function(req, res, next, bucket) {
			res.status(201).json(bucket);
		}
	});

	request(app).get("/").end(function(err, res) {
		t.equal(res.status, 201);
		t.assert(close_to(res.body.tokens, 0));
		t.end();
	});
});

tap.test("custom on_throttled function", function(t) {
	var app = create_app({
		"rate": "1/s",
		"on_throttled": function(req, res, next, bucket) {
			res.status(503).json(bucket);
		}
	});

	request(app).get("/").end(function() {});
	request(app).get("/").end(function(err, res) {
		t.equal(res.status, 503);
		t.assert(close_to(res.body.tokens, 0));
		t.end();
	});
});

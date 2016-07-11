"use strict";

var test = require("tape");
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

test("fail to init...", t => {
	t.test("...without options", st => {
		st.throws(throttle, new Error);
		st.end();
	});

	t.test("...with first argument not being a string or object", st => {
		st.throws(() => throttle(5), new Error);
		st.end();
	});

	t.test("...with invalid rate string (float not allowed)", st => {
		st.throws(() => throttle("1.0/h"), new Error);
		st.end();
	});

	t.test("...with invalid rate string (float not allowed)", st => {
		st.throws(() => throttle("1/2.0h"), new Error);
		st.end();
	});

	t.test("...with invalid rate option", st => {
		st.throws(() => throttle("10/m:test"), new Error);
		st.end();
	});

	t.test("...with empty option object", st => {
		st.throws(() => throttle({}), new Error);
		st.end();
	});

	t.test("...with 'burst' not being a number", st => {
		st.throws(() => throttle({ "rate": "1/s", "burst": "5" }), new Error);
		st.end();
	});

	t.test("...with 'key' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "key": 1 }), new Error);
		st.end();
	});

	t.test("...with 'cost' not being a number or function", st => {
		st.throws(() => throttle({ "rate": "1/s", "cost": "5" }), new Error);
		st.end();
	});

	t.test("...with 'on_allowed' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "on_allowed": "test" }), new Error);
		st.end();
	});

	t.test("...with 'on_throttled' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "on_throttled": "test" }), new Error);
		st.end();
	});
});

test("init with...", t => {
	t.test("...rate", st => {
		st.doesNotThrow(() => throttle("1/200ms"));
		st.doesNotThrow(() => throttle("1/s"));
		st.doesNotThrow(() => throttle("1/2sec"));
		st.doesNotThrow(() => throttle("1/second"));
		st.doesNotThrow(() => throttle("1/m"));
		st.doesNotThrow(() => throttle("1/3min"));
		st.doesNotThrow(() => throttle("1/minute"));
		st.doesNotThrow(() => throttle("1/4h"));
		st.doesNotThrow(() => throttle("1/hour"));
		st.doesNotThrow(() => throttle("1/d"));
		st.doesNotThrow(() => throttle("1/5day"));
		st.doesNotThrow(() => throttle("1/m:fixed"));
		st.end();
	});

	t.test("...options object", st => {
		st.doesNotThrow(() => throttle({
			"rate": "1/s",
			"burst": 5,
			"key": () => true,
			"cost": () => true,
			"on_allowed": () => true,
			"on_throttled": () => true
		}));
		
		st.end();
	});
});

test("passthrough...", t => {
	function verify(st, end) {
		return function(err, res) {
			st.equal(res.status, 200);

			if (end) {
				st.end();
			}
		};
	}

	t.test("...2 requests with enough gap @ rate 5/s", st => {
		var app = create_app({ "rate": "5/s", "burst": 1 });
		request(app).get("/").end(verify(st));
		setTimeout(() => {
			request(app).get("/").end(verify(st, true));
		}, 250); // add 50ms to allow some margin for error
	});

	t.test("...2 requests with enough gap @ rate 5/2s", st => {
		var app = create_app({ "rate": "5/2s", "burst": 1 });
		request(app).get("/").end(verify(st));
		setTimeout(() => {
			request(app).get("/").end(verify(st, true));
		}, 450);
	});

	t.test("...2 requests with enough gap @ rate 5/s:fixed", st => {
		var app = create_app({ "rate": "5/s:fixed", "burst": 1 });
		request(app).get("/").end(verify(st));
		setTimeout(() => {
			request(app).get("/").end(verify(st, true));
		}, 1050);
	});
});

test("throttle...", t => {
	function verify(st, end) {
		return function(err, res) {
			st.equal(res.status, 429);

			if (end) {
				st.end();
			}
		};
	}

	t.test("...2 requests without enough gap @ rate 5/s", st => {
		var app = create_app({ "rate": "5/s", "burst": 1 });
		request(app).get("/").end(() => true);
		setTimeout(() => {
			request(app).get("/").end(verify(st, true));
		}, 150);
	});

	t.test("...2 requests without enough gap @ rate 5/2s", st => {
		var app = create_app({ "rate": "5/2s", "burst": 1 });
		request(app).get("/").end(() => true);
		setTimeout(() => {
			request(app).get("/").end(verify(st, true));
		}, 350);
	});

	t.test("...2 requests without enough gap @ rate 5/s:fixed", st => {
		var app = create_app({ "rate": "5/s:fixed", "burst": 1 });
		request(app).get("/").end(() => true);
		setTimeout(() => {
			request(app).get("/").end(verify(st, true));
		}, 950);
	});
});

test("custom store...", t => {
	t.test("...that fails to retrieve", st => {
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

		request(app).get("/").end(() => st.end());
	});

	t.test("...that fails to save", st => {
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

		request(app).get("/").end(() => st.end());
	});

	t.test("...that works", st => {
		var store = new MemoryStore();
		var app = create_app({ "rate": "1/s", "store": store });

		request(app).get("/").end((err, res) => {
			st.equal(res.status, 200);
			store.get(res.body, (err, bucket) => {
				st.ok(bucket);
				st.end();
			});
		});
	});
});

test("respect x-forwarded-for header", t => {
	var store = new MemoryStore();
	var proxy_ip = "123.123.123.123";
	var app = create_app({ "rate": "1/s", "store": store });

	request(app).get("/").set("x-forwarded-for", proxy_ip).end((err, res) => {
		t.equal(res.status, 200);
		store.get(proxy_ip, (err, bucket) => {
			t.ok(bucket);
			t.end();
		});
	});
});

test("custom key function", t => {
	var store = new MemoryStore();
	var custom_key = "custom_key";
	var app = create_app({
		"rate": "1/s",
		"store": store,
		"key": function() { return custom_key; }
	});

	request(app).get("/").end((err, res) => {
		t.equal(res.status, 200);
		store.get(custom_key, (err, bucket) => {
			t.ok(bucket);
			t.end();
		});
	});
});

test("custom cost value", t => {
	var store = new MemoryStore();
	var app = create_app({
		"rate": "1/s",
		"burst": 5,
		"store": store,
		"cost": 3
	});

	request(app).get("/").end((err, res) => {
		store.get(res.body, (err, bucket) => {
			t.equal(res.status, 200);
			t.assert(close_to(bucket.tokens, 2));

			request(app).get("/").end((err, res) => {
				t.equal(res.status, 429);
				t.end();
			});
		});
	});
});

test("custom cost function passthrough", t => {
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

	request(app).get("/yes").end((err, res) => {
		store.get(res.body, (err, bucket) => {
			t.equal(res.status, 200);
			t.assert(close_to(bucket.tokens, 5));

			request(app).get("/no").end((err, res) => {
				store.get(res.body, (err, bucket) => {
					t.equal(res.status, 200);
					t.assert(close_to(bucket.tokens, 2));
					
					request(app).get("/no").end((err, res) => {
						t.equal(res.status, 429);
						t.end();
					});
				});
			});
		});
	});
});

test("custom on_allowed function", t => {
	var app = create_app({
		"rate": "1/s",
		"on_allowed": function(req, res, next, bucket) {
			res.status(201).json(bucket);
		}
	});

	request(app).get("/").end((err, res) => {
		t.equal(res.status, 201);
		t.assert(close_to(res.body.tokens, 0));
		t.end();
	});
});

test("custom on_throttled function", t => {
	var app = create_app({
		"rate": "1/s",
		"on_throttled": function(req, res, next, bucket) {
			res.status(503).json(bucket);
		}
	});

	request(app).get("/").end(() => true);
	request(app).get("/").end((err, res) => {
		t.equal(res.status, 503);
		t.assert(close_to(res.body.tokens, 0));
		t.end();
	});
});

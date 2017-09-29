"use strict";

var tap = require("tap");
var express = require("express");
var request = require("supertest");

var MemoryStore = require("../lib/memory-store");
var throttle = require("../lib/throttle");

function create_app(options) {
	var app = express();

	options.on_allowed = function(req, res, next, bucket) {
		res.status(200).json(bucket);
	}

	app.get("*", throttle(options));

	return app;
}

function response(t, status, tokens, callback) {
	return function(err, res) {
		if (status) {
			t.equal(res.status, status);
		}

		if (tokens) {
			t.equal(Math.round(res.body.tokens), tokens);
		}

		if (callback) {
			callback();
		} else {
			t.end();
		}
	}
}

function noop() {}

tap.test("rolling window", function(t) {
	var app = create_app({ "burst": 2, "rate": "1/100ms" });
	request(app).get("/").end(response(t, 200, 1, noop));
	request(app).get("/").end(response(t, 200, 0, noop));
	setTimeout(function() {
		request(app).get("/").end(response(t, 429, 0, noop));
	}, 50);
	setTimeout(function() {
		request(app).get("/").end(response(t, 200, 0, noop));
	}, 120);
	setTimeout(function() {
		request(app).get("/").end(response(t, 200, 1));
	}, 320);
});

tap.test("fixed window", function(t) {
	var app = create_app({ "burst": 2, "period": "100ms" });
	request(app).get("/").end(response(t, 200, 1, noop));
	request(app).get("/").end(response(t, 200, 0, noop));
	setTimeout(function() {
		request(app).get("/").end(response(t, 429, 0, noop));
	}, 50);
	setTimeout(function() {
		request(app).get("/").end(response(t, 200, 1, noop));
	}, 120);
	setTimeout(function() {
		request(app).get("/").end(response(t, 200, 0));
	}, 140);
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
		app.get("/", throttle({ "burst": 1, "rate": "1/s", "store": new FailStore() }),
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
		app.get("/", throttle({ "burst": 1, "rate": "1/s", "store": new FailStore() }),
		function(err, req, res, next) { // eslint-disable-line no-unused-vars
			st.assert(err instanceof Error);
			res.status(500).end();
		});

		request(app).get("/").end(function() { st.end(); });
	});

	t.test("...that works", function(st) {
		var store = new MemoryStore();
		var app = create_app({ "burst": 1, "rate": "1/s", "store": store });

		request(app).get("/").end(function(err, res) {
			st.equal(res.status, 200);
			st.end();
		});
	});
});

tap.test("custom key function", function(t) {
	var store = new MemoryStore();
	var custom_key = "custom_key";
	var app = create_app({
		"burst": 1,
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
		"burst": 5,
		"rate": "1/s",
		"store": store,
		"cost": 3
	});

	request(app).get("/").end(function(err, res) {
		t.equal(res.status, 200);
		t.equal(Math.round(res.body.tokens), 2);
		request(app).get("/").end(response(t, 429));
	});
});

tap.test("custom cost function", function(t) {
	var store = new MemoryStore();
	var app = create_app({
		"burst": 5,
		"rate": "1/s",
		"store": store,
		"cost": function(req) {
			return req.path == "/admin" ? 0 : 3;
		}
	});

	app.get("/:admin", function(req, res) {
		res.status(200).end();
	});

	request(app).get("/admin").end(response(t, 200, 5, function() {
		request(app).get("/").end(response(t, 200, 2, function() {
			request(app).get("/").end(response(t, 429));
		}));
	}));
});

tap.test("disable auto_drain", function(t) {
	var app = create_app({
		"rate": "1/s",
		"auto_drain": false
	});

	app.get("/", function(req, res) {
		res.status(200).end();
	});

	request(app).get("/").end(response(t, 200, 1, function() {
		request(app).get("/").end(response(t, 200, 1, function() {
			request(app).get("/").end(response(t, 200, 1));
		}));
	}));
});

tap.test("drain tokens", function(t) {
	var app = create_app({
		"rate": "1/s",
		"auto_drain": false,
	});

	app.get("/:param", function(req, res) {
		if(req.path == "/drain") {
			req.drain();
		}

		res.status(200).end();
	});

	request(app).get("/").end(response(t, 200, 1, function() {
		request(app).get("/drain").end(response(t, 200, 1, function() {
			request(app).get("/").end(response(t, 429));
		}));
	}));
});

tap.test("drain tokens only once", function(t) {
	var app = create_app({
		"rate": "2/s",
		"auto_drain": false,
	});

	app.get("/", function(req, res) {
		req.drain();
		req.drain(); // It has no effect
		res.status(200).end();
	});

	request(app).get("/").end(response(t, 200, 2, function() {
		request(app).get("/").end(response(t, 200, 1));
	}));
});

tap.test("drain tokens only once again", function(t) {
	var app = create_app({
		"rate": "2/s",
		"auto_drain": true,
	});

	app.get("/", function(req, res) {
		req.drain(); // It has no effect
		res.status(200).end();
	});

	request(app).get("/").end(response(t, 200, 1, function() {
		request(app).get("/").end(response(t, 200, 0));
	}));
});

tap.test("failed to drain tokens", function(t) {
	var err = new Error('It is an error!');
	var store = {
		get: function(key, callback) {
			callback(null, { tokens: 1, mtime: Date.now() });
		},
		set: function(key, bucket, callback) {
			if(bucket.tokens == 0) {
				callback(err);
			} else {
				callback();
			}
		}
	};

	var app = create_app({
		"rate": "1/s",
		"store": store,
		"auto_drain": false
	});

	app.get("/", function(req, res) { // eslint-disable-line no-unused-vars
		t.throws(req.drain, err);
	});

	request(app).get("/").end(response(t));
});

tap.test("mixed auto_drain", function(t) {
	var app = express();
	app.get("/",
		throttle({ "rate": "1/s", "auto_drain": true }),
		throttle({ "rate": "1/s", "auto_drain": false }),
		function(req, res, next) { // eslint-disable-line no-unused-vars
			res.status(200).end();
	});

	request(app).get("/").end(response(t, 200, 0));
});

tap.test("default on_allowed function", function(t) {
	var app = express();
	app.get("/", throttle({ "burst": 1, "rate": "1/s" }),
	function(req, res, next) { // eslint-disable-line no-unused-vars
		res.status(200).end();
	});

	request(app).get("/").end(response(t, 200, 0));
});

tap.test("custom on_throttled function", function(t) {
	var app = create_app({
		"burst": 1,
		"rate": "1/s",
		"on_throttled": function(req, res, next, bucket) {
			res.status(503).json(bucket);
		}
	});

	request(app).get("/").end(noop);
	request(app).get("/").end(response(t, 503, 0));
});

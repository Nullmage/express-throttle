"use strict";

var format = require("util").format;
var express = require("express");
var throttle = require("../");

var app = express();

function key(req) {
	return req.random_ip;
}

app.use(function(req, res, next) {
	var rand = Math.floor(Math.random() * Math.pow(2, 16));
	var random_ip = format(
		"%d.&d.%d.%d",
		rand & 255, (rand >> 8) & 255, (rand >> 16) & 255, (rand >> 24) & 255
	);

	req.random_ip = random_ip;
	next();
});

app.get("/throttle", throttle({
	"key": key,
	"rate": "1/10s"
}));

app.get("/throttle-fixed", throttle({
	"key": key,
	"rate": "1/10s:fixed"
}));

app.get("*", function(req, res) {
	res.status(200).end();
});

var server = require("http").createServer(app);
server.listen(3000, function() {
	console.log("Listening on 3000..."); // eslint-disable-line no-console
});

;
/*
Copyright (C) 2015 Canonical Ltd.

XXX jcssackett 2015-09-18: Licensing for juju.js? It's different then the
licensing for the GUI.
*/

'use strict';

var module = module;

(function (exports) {

    //TODO add docs, esp for bakery
    var env = function(url, bakery) {
        jemUrl = url + '/v1';
        this.listEnvironments = function() {};
        this.getEnvironment = function () {};
    };

    var jujulib = {
        charmstore: function() {},
        environment: env,
        identity: function() {}
    };

    exports.jujulib = jujulib;

}((module && module.exports) ? module.exports : this));

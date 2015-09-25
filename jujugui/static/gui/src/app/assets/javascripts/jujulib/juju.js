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
        var jemUrl = url + '/v1';

        var _makeRequest = function(path, success, failure) {
            bakery.sendGetRequest(path, null, success, failure);
        };

        this.listEnvironments = function(success, failure) {
            _makeRequest(jemUrl + '/env', function(xhr) {
                var data = JSON.parse(xhr.target.responseText);
                success(data.environments);
            }, failure);
        };

        this.getEnvironment = function (username, envName, success, failure) {
            var url = [jemUrl, 'env', username, envName].join('/');
            _makeRequest(url, function(xhr) {
                var data = JSON.parse(xhr.target.responseText);
                success(data);
            }, failure);
        };
    };

    var jujulib = {
        charmstore: function() {},
        environment: env,
        identity: function() {}
    };

    exports.jujulib = jujulib;

}((module && module.exports) ? module.exports : this));

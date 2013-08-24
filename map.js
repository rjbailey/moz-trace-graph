/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Simple Map substitute for browsers other than Firefox. Not fully
 * functional, but good enough for event-emitter and trace-graph.
 */
if (typeof Map !== "function") {
  Map = function() {
    this.obj = Object.create(null);
  };
  Map.prototype = {
    get: function(key) { return this.obj[key]; },
    has: function(key) { return Object.hasOwnProperty.call(this.obj, key); },
    set: function(key, value) { this.obj[key] = value; }
  };
}

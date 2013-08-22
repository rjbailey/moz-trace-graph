/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Traces encapsulate a full trace of function calls.
 *
 * @param {object} client
 *        The event emitter providing trace data.
 * @param {string} name
 *        The name of the trace.
 */
function Trace(client, name) {
  this.name = name;
  this.children = [];  // List of call trees
  this.frames  = [];   // List of all frames
  this.functions = []; // function ID -> aggregated function info

  this.maxDepth = 0;

  // Used only while collecting trace data
  this._stack = [this]; // Frames on current call stack
  this._functionIds = new Map(); // name:location -> function ID

  this.onEnteredFrame = this.onEnteredFrame.bind(this);
  this.onExitedFrame = this.onExitedFrame.bind(this);

  if (client) {
    this._client = client;
    this._client.addListener("enteredFrame", this.onEnteredFrame);
    this._client.addListener("exitedFrame", this.onExitedFrame);
  }

  EventEmitter.decorate(this);
};

Trace.prototype = {
  get _currentFrame() { return this._stack[this._stack.length - 1]; },

  get totalTime() { return this.endTime; },

  /**
   * Removes event listeners.
   */
  finish: function() {
    this._client.removeListener("enteredFrame", this.onEnteredFrame);
    this._client.removeListener("exitedFrame", this.onExitedFrame);
    this._stack = null;
    this._functionIds = null;
    this.finished = true;
    this.emit("finished", this);
  },

  /**
   * Returns a JSON representation of this trace.
   *
   * @return {string}
   */
  toJSON: function() {
    var jsonObj = Object.create(null);
    jsonObj.functions = this.functions;
    jsonObj.children = [];
    for (var child of this.children) {
      jsonObj.children.push(this._frameToJSONObj(child));
    }
    return JSON.stringify(jsonObj);
  },

  /**
   * Returns an object representation of a frame without cyclic
   * references or redundant information, for use by JSON.stringify.
   *
   * @param {object} frame
   * @return {object}
   */
  _frameToJSONObj: function(frame) {
    var jsonObj = Object.create(null);

    var propsToCopy = [
      "fid",
      "startTime",
      "endTime",
      "arguments",
      "return",
      "throw",
      "yield"
    ];

    for (var prop of propsToCopy) {
      if (frame.hasOwnProperty(prop)) {
        jsonObj[prop] = frame[prop];
      }
    }

    jsonObj.children = [];
    for (var child of frame.children) {
      jsonObj.children.push(this._frameToJSONObj(child));
    }

    return jsonObj;
  },

  /**
   * Returns the stack frame in this trace with the given UID.
   *
   * @param {integer} uid
   *        The UID of the desired frame.
   */
  frameByUid: function(uid) {
    return this.frames[uid];
  },

  /**
   * Called when a new stack frame is entered.
   *
   * @param {string} ev
   *        The event type.
   * @param {object} packet
   *        The frame entry packet from the trace client.
   */
  onEnteredFrame: function(ev, packet) {
    var current = this._currentFrame;
    var frame = {
      uid: this.frames.length,
      depth: this._stack.length - 1,
      children: []
    };

    // Add references to parent and siblings
    if (current) {
      frame.older = current;
      if (current.children.length) {
        frame.previous = current.children[current.children.length - 1];
        frame.previous.next = frame;
      }
    }

    // Add new frame to frames list, parent, and frame stack
    this.frames.push(frame);
    current.children.push(frame);
    this._stack.push(frame);
    if (frame.depth > this.maxDepth) {
      this.maxDepth = frame.depth;
    }

    // Add reference to aggregated info, creating it if necessary
    var key = locationToString(packet.location, packet.name);
    if (!this._functionIds.has(key)) {
      this._functionIds.set(key, this.functions.length);
      this.functions.push({
        count: 0,
        name: packet.name,
        location: packet.location,
        parameterNames: packet.parameterNames
      });
    }
    frame.fid = this._functionIds.get(key);
    var aggregated = this.functions[frame.fid];
    aggregated.count++;
    frame.aggregated = aggregated;
    frame.name = aggregated.name;
    frame.location = aggregated.location;
    frame.parameterNames = aggregated.parameterNames;

    // Add frame start time and update trace timing
    frame.startTime = packet.time;
    if (typeof this.startTime !== "number") {
      this.startTime = frame.startTime;
    }
    this.endTime = frame.startTime;

    // Add remaining properties
    frame.callsite = packet.callsite;
    frame.arguments = packet.arguments;

    this.emit("enteredFrame", frame);
  },

  /**
   * Called when a stack frame is exited.
   *
   * @param {string} ev
   *        The event type.
   * @param {object} packet
   *        The frame exit packet from the trace client.
   */
  onExitedFrame: function(ev, packet) {
    var frame = this._currentFrame;

    if (frame === this) {
      // We've seen more exits than entries because the trace was
      // started while some frames were on the stack.
      this.finish();
    } else {
      this._stack.pop();

      // Add frame end time and update trace timing
      frame.endTime = packet.time;
      frame.totalTime = frame.endTime - frame.startTime;
      var selfTime = frame.totalTime;
      for (var child of frame.children) {
        selfTime -= child.totalTime;
      }
      frame.selfTime = selfTime;

      if (typeof frame.aggregated.totalTime === "undefined") {
        frame.aggregated.totalTime = 0;
        frame.aggregated.selfTime = 0;
      }
      frame.aggregated.totalTime += frame.totalTime;
      frame.aggregated.selfTime += frame.selfTime;

      if (!this.endTime || frame.endTime > this.endTime) {
        this.endTime = frame.endTime;
      }

      for (var type of ["return", "throw", "yield"]) {
        if (typeof packet[type] !== "undefined") {
          frame[type] = packet[type];
        }
      }

      this.emit("exitedFrame", frame);
    }
  }
};

/**
 * Returns a string representation of the given source
 * location.
 *
 * @param {SourceLocation} loc
 *        The source location to convert to a string.
 * @param {string} name
 *        The function name, to distinguish this location from other
 *        functions which claim to be defined at the same source
 *        location. Workaround to deal with the fact that anonymous
 *        inner functions report the same location as the outer
 *        function.
 */
function locationToString(loc, name) {
  return (name || "") + JSON.stringify(loc);
}

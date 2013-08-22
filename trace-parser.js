/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const parseTrace = function(data) {
  if (typeof data === "string") {
    data = JSON.parse(data);
  }
  var trace = new Trace();
  var functions = data.functions;

  function enterFrame(frame) {
    var aggregated = functions[frame.fid];
    var packet = {
      name: aggregated.name,
      location: aggregated.location,
      callsite: frame.callsite,
      time: frame.startTime,
      parameterNames: aggregated.parameterNames,
      arguments: frame.arguments
    };

    trace.onEnteredFrame(null, packet);

    for (var child of frame.children) {
      enterFrame(child);
    }

    exitFrame(frame);
  }

  function exitFrame(frame) {
    var aggregated = functions[frame.fid];
    var packet = {
      time: frame.endTime,
      return: frame.return,
      throw: frame.throw,
      yield: frame.yield,
    };
    trace.onExitedFrame(null, packet);
  }

  for (var child of data.children) {
    enterFrame(child);
  }

  trace.finished = true;
  return trace;
};

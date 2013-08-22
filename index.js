window.onload = function() {
  var container = document.getElementById("visualization");
  var graph = new TraceGraph(container);
  var trace = parseTrace(DATA);
  graph.setTrace(trace);
}

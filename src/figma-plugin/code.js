// MCP Figma Bridge — Plugin Command Dispatcher
// Receives commands from ui.html (via WebSocket) and executes Figma Plugin API calls.
// This file runs in Figma's WASM sandbox — no DOM, no fetch, no localStorage.

figma.showUI(__html__, { width: 320, height: 420, themeColors: true });

// ============================================================
// Node Serialization
// ============================================================

/** Convert a Figma node to a JSON-safe object with depth limiting */
function serializeNode(node, depth, maxDepth) {
  if (depth === undefined) depth = 0;
  if (maxDepth === undefined) maxDepth = 3;

  const base = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
  };

  // Geometry (if available)
  if ("x" in node) base.x = node.x;
  if ("y" in node) base.y = node.y;
  if ("width" in node) base.width = node.width;
  if ("height" in node) base.height = node.height;
  if ("rotation" in node) base.rotation = node.rotation;
  if ("opacity" in node) base.opacity = node.opacity;

  // Fills & strokes
  if ("fills" in node && node.fills !== figma.mixed) {
    base.fills = node.fills;
  }
  if ("strokes" in node) {
    base.strokes = node.strokes;
    base.strokeWeight = node.strokeWeight;
  }
  if ("cornerRadius" in node && node.cornerRadius !== figma.mixed) {
    base.cornerRadius = node.cornerRadius;
  }

  // Text
  if (node.type === "TEXT") {
    base.characters = node.characters;
    if (node.fontSize !== figma.mixed) base.fontSize = node.fontSize;
    if (node.fontName !== figma.mixed) base.fontName = node.fontName;
    if (node.textAlignHorizontal) base.textAlignHorizontal = node.textAlignHorizontal;
  }

  // Auto-layout
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    base.layoutMode = node.layoutMode;
    base.itemSpacing = node.itemSpacing;
    base.paddingTop = node.paddingTop;
    base.paddingRight = node.paddingRight;
    base.paddingBottom = node.paddingBottom;
    base.paddingLeft = node.paddingLeft;
    if ("primaryAxisAlignItems" in node) base.primaryAxisAlignItems = node.primaryAxisAlignItems;
    if ("counterAxisAlignItems" in node) base.counterAxisAlignItems = node.counterAxisAlignItems;
  }

  // Children (depth limited)
  if ("children" in node && depth < maxDepth) {
    base.children = node.children.map(function (c) {
      return serializeNode(c, depth + 1, maxDepth);
    });
    base.childCount = node.children.length;
  } else if ("children" in node) {
    base.childCount = node.children.length;
  }

  return base;
}

// ============================================================
// Command Handlers
// ============================================================

/** Get document structure */
function cmdGetDocumentInfo() {
  return {
    name: figma.root.name,
    pages: figma.root.children.map(function (p) {
      return { id: p.id, name: p.name, childCount: p.children.length };
    }),
    currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
  };
}

/** Get currently selected nodes */
function cmdGetSelection() {
  return {
    count: figma.currentPage.selection.length,
    nodes: figma.currentPage.selection.map(function (n) {
      return serializeNode(n, 0, 2);
    }),
  };
}

/** Get single node info */
function cmdGetNodeInfo(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node) return { error: "Node not found: " + params.nodeId };
  return serializeNode(node, 0, params.depth || 3);
}

/** Get current page children */
function cmdGetPageNodes(params) {
  var page = params.pageId ? figma.getNodeById(params.pageId) : figma.currentPage;
  if (!page || page.type !== "PAGE") return { error: "Page not found" };
  var maxChildren = Math.min(page.children.length, 500);
  return {
    pageId: page.id,
    pageName: page.name,
    childCount: page.children.length,
    children: page.children.slice(0, maxChildren).map(function (n) {
      return serializeNode(n, 0, params.depth || 2);
    }),
  };
}

/** Scan all text nodes under a parent */
function cmdScanTextNodes(params) {
  var parent = params.parentId ? figma.getNodeById(params.parentId) : figma.currentPage;
  if (!parent) return { error: "Parent not found" };
  var textNodes = [];
  function walk(node) {
    if (node.type === "TEXT") {
      textNodes.push({ id: node.id, name: node.name, characters: node.characters });
    }
    if ("children" in node) {
      node.children.forEach(walk);
    }
  }
  walk(parent);
  return { count: textNodes.length, nodes: textNodes.slice(0, 200) };
}

/** Scan nodes by type */
function cmdScanNodesByType(params) {
  var types = params.types || [];
  var parent = params.parentId ? figma.getNodeById(params.parentId) : figma.currentPage;
  if (!parent) return { error: "Parent not found" };
  var found = [];
  function walk(node) {
    if (types.includes(node.type)) {
      found.push(serializeNode(node, 0, 1));
    }
    if ("children" in node) node.children.forEach(walk);
  }
  walk(parent);
  return { count: found.length, nodes: found.slice(0, 200) };
}

/** Helper: apply fill color to a node */
function applyFillColor(node, color) {
  if (color && "r" in color) {
    node.fills = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b }, opacity: color.a !== undefined ? color.a : 1 }];
  }
}

/** Helper: find or default parent node */
function getParent(parentId) {
  if (parentId) {
    var p = figma.getNodeById(parentId);
    if (p && "appendChild" in p) return p;
  }
  return figma.currentPage;
}

/** Create frame */
function cmdCreateFrame(params) {
  var frame = figma.createFrame();
  frame.x = params.x || 0;
  frame.y = params.y || 0;
  frame.resize(params.width || 100, params.height || 100);
  if (params.name) frame.name = params.name;
  if (params.fillColor) applyFillColor(frame, params.fillColor);
  if (params.layoutMode && params.layoutMode !== "NONE") {
    frame.layoutMode = params.layoutMode;
    if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing;
    if (params.padding !== undefined) {
      frame.paddingTop = params.padding;
      frame.paddingRight = params.padding;
      frame.paddingBottom = params.padding;
      frame.paddingLeft = params.padding;
    }
  }
  getParent(params.parentId).appendChild(frame);
  return serializeNode(frame, 0, 1);
}

/** Create rectangle */
function cmdCreateRectangle(params) {
  var rect = figma.createRectangle();
  rect.x = params.x || 0;
  rect.y = params.y || 0;
  rect.resize(params.width || 100, params.height || 100);
  if (params.name) rect.name = params.name;
  if (params.fillColor) applyFillColor(rect, params.fillColor);
  if (params.cornerRadius !== undefined) rect.cornerRadius = params.cornerRadius;
  getParent(params.parentId).appendChild(rect);
  return serializeNode(rect, 0, 1);
}

/** Create text node */
async function cmdCreateText(params) {
  var text = figma.createText();
  var family = params.fontFamily || "Inter";
  var style = params.fontStyle || "Regular";
  await figma.loadFontAsync({ family: family, style: style });
  text.characters = params.text || "";
  text.x = params.x || 0;
  text.y = params.y || 0;
  if (params.fontSize) text.fontSize = params.fontSize;
  if (params.name) text.name = params.name;
  if (params.fillColor) applyFillColor(text, params.fillColor);
  if (params.textAlignHorizontal) text.textAlignHorizontal = params.textAlignHorizontal;
  getParent(params.parentId).appendChild(text);
  return serializeNode(text, 0, 1);
}

/** Create ellipse */
function cmdCreateEllipse(params) {
  var ellipse = figma.createEllipse();
  ellipse.x = params.x || 0;
  ellipse.y = params.y || 0;
  ellipse.resize(params.width || 100, params.height || 100);
  if (params.name) ellipse.name = params.name;
  if (params.fillColor) applyFillColor(ellipse, params.fillColor);
  getParent(params.parentId).appendChild(ellipse);
  return serializeNode(ellipse, 0, 1);
}

/** Move node */
function cmdMoveNode(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("x" in node)) return { error: "Node not found or not movable" };
  node.x = params.x;
  node.y = params.y;
  return { id: node.id, x: node.x, y: node.y };
}

/** Resize node */
function cmdResizeNode(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("resize" in node)) return { error: "Node not found or not resizable" };
  node.resize(params.width, params.height);
  return { id: node.id, width: node.width, height: node.height };
}

/** Set node name */
function cmdSetName(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node) return { error: "Node not found" };
  node.name = params.name;
  return { id: node.id, name: node.name };
}

/** Set corner radius */
function cmdSetCornerRadius(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("cornerRadius" in node)) return { error: "Node not found or no corner radius" };
  node.cornerRadius = params.radius;
  return { id: node.id, cornerRadius: node.cornerRadius };
}

/** Delete node */
function cmdDeleteNode(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node) return { error: "Node not found" };
  var id = node.id;
  node.remove();
  return { deleted: id };
}

/** Clone node */
function cmdCloneNode(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("clone" in node)) return { error: "Node not found or not cloneable" };
  var clone = node.clone();
  if (params.parentId) getParent(params.parentId).appendChild(clone);
  return serializeNode(clone, 0, 1);
}

/** Group nodes */
function cmdGroupNodes(params) {
  var nodes = params.nodeIds.map(function (id) { return figma.getNodeById(id); }).filter(Boolean);
  if (nodes.length < 2) return { error: "Need at least 2 valid nodes to group" };
  var group = figma.group(nodes, figma.currentPage);
  if (params.name) group.name = params.name;
  return serializeNode(group, 0, 1);
}

/** Set fill color */
function cmdSetFillColor(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("fills" in node)) return { error: "Node not found or no fills" };
  node.fills = [{
    type: "SOLID",
    color: { r: params.r, g: params.g, b: params.b },
    opacity: params.a !== undefined ? params.a : 1,
  }];
  return { id: node.id, fills: node.fills };
}

/** Set stroke */
function cmdSetStroke(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("strokes" in node)) return { error: "Node not found or no strokes" };
  node.strokes = [{
    type: "SOLID",
    color: { r: params.r, g: params.g, b: params.b },
    opacity: params.a !== undefined ? params.a : 1,
  }];
  node.strokeWeight = params.width || 1;
  return { id: node.id, strokes: node.strokes, strokeWeight: node.strokeWeight };
}

/** Set text content */
async function cmdSetTextContent(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || node.type !== "TEXT") return { error: "Node not found or not a text node" };
  // Load current font before editing
  var fontName = node.fontName !== figma.mixed ? node.fontName : { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(fontName);
  node.characters = params.text;
  return { id: node.id, characters: node.characters };
}

/** Set font size */
async function cmdSetFontSize(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || node.type !== "TEXT") return { error: "Node not found or not a text node" };
  var fontName = node.fontName !== figma.mixed ? node.fontName : { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(fontName);
  node.fontSize = params.fontSize;
  return { id: node.id, fontSize: node.fontSize };
}

/** Set opacity */
function cmdSetOpacity(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("opacity" in node)) return { error: "Node not found or no opacity" };
  node.opacity = params.opacity;
  return { id: node.id, opacity: node.opacity };
}

/** Set auto-layout */
function cmdSetAutoLayout(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("layoutMode" in node)) return { error: "Node not found or cannot have auto-layout" };
  node.layoutMode = params.mode || "VERTICAL";
  if (params.spacing !== undefined) node.itemSpacing = params.spacing;
  if (params.padding !== undefined) {
    node.paddingTop = params.padding;
    node.paddingRight = params.padding;
    node.paddingBottom = params.padding;
    node.paddingLeft = params.padding;
  }
  if (params.primaryAxisAlignItems) node.primaryAxisAlignItems = params.primaryAxisAlignItems;
  if (params.counterAxisAlignItems) node.counterAxisAlignItems = params.counterAxisAlignItems;
  return serializeNode(node, 0, 1);
}

/** Get local paint styles */
function cmdGetLocalStyles() {
  var paintStyles = figma.getLocalPaintStyles().map(function (s) {
    return { id: s.id, name: s.name, paints: s.paints };
  });
  var textStyles = figma.getLocalTextStyles().map(function (s) {
    return { id: s.id, name: s.name, fontSize: s.fontSize, fontName: s.fontName };
  });
  return { paintStyles: paintStyles, textStyles: textStyles };
}

/** Export node as image */
async function cmdExportNode(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node || !("exportAsync" in node)) return { error: "Node not found or not exportable" };
  var format = (params.format || "PNG").toUpperCase();
  var scale = params.scale || 1;
  var settings = { format: format, contentsOnly: true };
  if (format !== "SVG") settings.constraint = { type: "SCALE", value: scale };
  var bytes = await node.exportAsync(settings);
  // Convert Uint8Array to base64
  var binary = "";
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Plugin sandbox doesn't have btoa, use manual base64
  var base64 = figmaBase64Encode(bytes);
  return { id: node.id, format: format, base64: base64, byteLength: bytes.length };
}

/** Base64 encoder for plugin sandbox (no btoa available) */
function figmaBase64Encode(bytes) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var result = "";
  var i;
  for (i = 0; i < bytes.length - 2; i += 3) {
    result += chars[(bytes[i] >> 2) & 0x3f];
    result += chars[((bytes[i] & 0x03) << 4) | ((bytes[i + 1] >> 4) & 0x0f)];
    result += chars[((bytes[i + 1] & 0x0f) << 2) | ((bytes[i + 2] >> 6) & 0x03)];
    result += chars[bytes[i + 2] & 0x3f];
  }
  if (i < bytes.length) {
    result += chars[(bytes[i] >> 2) & 0x3f];
    if (i + 1 < bytes.length) {
      result += chars[((bytes[i] & 0x03) << 4) | ((bytes[i + 1] >> 4) & 0x0f)];
      result += chars[((bytes[i + 1] & 0x0f) << 2)];
      result += "=";
    } else {
      result += chars[((bytes[i] & 0x03) << 4)];
      result += "==";
    }
  }
  return result;
}

// ============================================================
// Command Dispatcher
// ============================================================

/** Whitelist of allowed commands */
const COMMAND_HANDLERS = {
  "get_document_info": cmdGetDocumentInfo,
  "get_selection": cmdGetSelection,
  "get_node_info": cmdGetNodeInfo,
  "get_page_nodes": cmdGetPageNodes,
  "scan_text_nodes": cmdScanTextNodes,
  "scan_nodes_by_type": cmdScanNodesByType,
  "create_frame": cmdCreateFrame,
  "create_rectangle": cmdCreateRectangle,
  "create_text": cmdCreateText,
  "create_ellipse": cmdCreateEllipse,
  "move_node": cmdMoveNode,
  "resize_node": cmdResizeNode,
  "set_name": cmdSetName,
  "set_corner_radius": cmdSetCornerRadius,
  "delete_node": cmdDeleteNode,
  "clone_node": cmdCloneNode,
  "group_nodes": cmdGroupNodes,
  "set_fill_color": cmdSetFillColor,
  "set_stroke": cmdSetStroke,
  "set_text_content": cmdSetTextContent,
  "set_font_size": cmdSetFontSize,
  "set_opacity": cmdSetOpacity,
  "set_auto_layout": cmdSetAutoLayout,
  "get_local_styles": cmdGetLocalStyles,
  "export_node": cmdExportNode,
};

/** Main message handler from ui.html */
figma.ui.onmessage = async function (msg) {
  if (msg.type === "execute-command") {
    var handler = COMMAND_HANDLERS[msg.command];
    if (!handler) {
      figma.ui.postMessage({
        type: "command-result",
        id: msg.id,
        result: null,
        error: "Unknown command: " + msg.command,
      });
      return;
    }

    try {
      var result = await handler(msg.params || {});
      // Separate error results from success results
      var hasError = result && result.error;
      figma.ui.postMessage({
        type: "command-result",
        id: msg.id,
        result: hasError ? null : result,
        error: hasError ? result.error : undefined,
      });
    } catch (err) {
      figma.ui.postMessage({
        type: "command-result",
        id: msg.id,
        result: null,
        error: err.message || String(err),
      });
    }
  }
};

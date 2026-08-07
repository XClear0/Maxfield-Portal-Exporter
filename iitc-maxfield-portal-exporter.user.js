// ==UserScript==
// @author          OpenAI Codex
// @id              iitc-maxfield-portal-exporter@openai-codex
// @name            IITC plugin: Maxfield Portal Exporter
// @category        Information
// @version         2.0.0
// @namespace       https://github.com/IITC-CE/ingress-intel-total-conversion
// @description     Export Draw Tools vertices/areas or Bookmarks to Maxfield, with C.O.R.E. inventory key counts.
// @include         https://intel.ingress.com/*
// @match           https://intel.ingress.com/*
// @grant           none
// ==/UserScript==

(function () {
  'use strict';

  function wrapper() {
    'use strict';

    if (typeof window.plugin !== 'function') window.plugin = function () {};

    window.plugin.maxfieldPortalExporter = function () {};
    var self = window.plugin.maxfieldPortalExporter;

    self.id = 'maxfield-portal-exporter';
    self.title = 'Maxfield Portal Exporter';
    self.version = '2.0.0';
    self.CACHE_KEY = 'plugin-maxfield-portal-exporter-inventory-v2';
    self.SETTINGS_KEY = 'plugin-maxfield-portal-exporter-settings-v2';
    self.CACHE_TTL_MS = 10 * 60 * 1000;
    self.DEFAULT_MATCH_DISTANCE = 25;
    self.directInventory = null;
    self.refreshPromise = null;
    self.lastResult = null;
    self.setupDone = false;

    self.escapeHtml = function (value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    self.isObject = function (value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    };

    self.isFiniteNumber = function (value) {
      return Number.isFinite(Number(value));
    };

    self.toNonNegativeInteger = function (value) {
      var number = Number(value);
      if (!Number.isFinite(number) || number < 0) return 0;
      return Math.floor(number);
    };

    self.formatDateTime = function (timestamp) {
      if (!timestamp) return '未知';
      try {
        return new Date(timestamp).toLocaleString();
      } catch (e) {
        return String(timestamp);
      }
    };

    self.loadSettings = function () {
      var defaults = {
        mode: 'vertices',
        matchDistance: self.DEFAULT_MATCH_DISTANCE,
        bookmarkFolder: '',
        includeKeys: true
      };
      try {
        var stored = JSON.parse(localStorage.getItem(self.SETTINGS_KEY) || '{}');
        if (self.isObject(stored)) {
          if (['vertices', 'areas', 'combined', 'bookmarks'].indexOf(stored.mode) !== -1) defaults.mode = stored.mode;
          if (Number(stored.matchDistance) > 0) defaults.matchDistance = Number(stored.matchDistance);
          if (typeof stored.bookmarkFolder === 'string') defaults.bookmarkFolder = stored.bookmarkFolder;
          if (typeof stored.includeKeys === 'boolean') defaults.includeKeys = stored.includeKeys;
        }
      } catch (e) {
        console.warn(self.title + ': could not load settings', e);
      }
      return defaults;
    };

    self.saveSettings = function () {
      var root = document.getElementById(self.id + '-root');
      if (!root) return;
      var mode = root.querySelector('#mpe-mode');
      var distance = root.querySelector('#mpe-distance');
      var folder = root.querySelector('#mpe-bookmark-folder');
      var includeKeys = root.querySelector('#mpe-include-keys');
      var data = {
        mode: mode ? mode.value : 'vertices',
        matchDistance: distance && Number(distance.value) > 0 ? Number(distance.value) : self.DEFAULT_MATCH_DISTANCE,
        bookmarkFolder: folder ? folder.value : '',
        includeKeys: includeKeys ? includeKeys.checked : true
      };
      try {
        localStorage.setItem(self.SETTINGS_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn(self.title + ': could not save settings', e);
      }
    };

    // ------------------------------------------------------------------------
    // C.O.R.E. Inventory
    // ------------------------------------------------------------------------

    self.getLiveInventoryMap = function () {
      var live = window.plugin && window.plugin.LiveInventory;
      if (!live || !self.isObject(live.keyMap)) return null;
      return live.keyMap;
    };

    self.summarizeKeyMap = function (keyMap) {
      var summary = {
        portals: 0,
        total: 0,
        outside: 0,
        inCapsules: 0,
        hasBreakdown: false
      };
      if (!self.isObject(keyMap)) return summary;

      Object.keys(keyMap).forEach(function (guid) {
        var entry = keyMap[guid] || {};
        var count = self.toNonNegativeInteger(entry.count);
        var capsuleCount = 0;

        if (self.isFiniteNumber(entry.inCapsules)) {
          capsuleCount = self.toNonNegativeInteger(entry.inCapsules);
          summary.hasBreakdown = true;
        } else if (self.isFiniteNumber(entry.totalincapsules)) {
          capsuleCount = self.toNonNegativeInteger(entry.totalincapsules);
          summary.hasBreakdown = true;
        } else if (self.isObject(entry.capsuleCounts)) {
          Object.keys(entry.capsuleCounts).forEach(function (capsuleId) {
            capsuleCount += self.toNonNegativeInteger(entry.capsuleCounts[capsuleId]);
          });
          summary.hasBreakdown = true;
        } else if (self.isObject(entry.capsules)) {
          Object.keys(entry.capsules).forEach(function (capsuleId) {
            capsuleCount += self.toNonNegativeInteger(entry.capsules[capsuleId]);
          });
          summary.hasBreakdown = true;
        }

        summary.portals += 1;
        summary.total += count;
        summary.inCapsules += Math.min(capsuleCount, count);
        summary.outside += Math.max(0, count - capsuleCount);
      });
      return summary;
    };

    self.loadDirectInventoryCache = function () {
      try {
        var parsed = JSON.parse(localStorage.getItem(self.CACHE_KEY) || 'null');
        if (!self.isObject(parsed) || !self.isObject(parsed.keyMap)) return null;
        if (!self.isFiniteNumber(parsed.updatedAt) || !self.isFiniteNumber(parsed.expiresAt)) return null;
        self.directInventory = {
          keyMap: parsed.keyMap,
          updatedAt: Number(parsed.updatedAt),
          expiresAt: Number(parsed.expiresAt),
          error: ''
        };
        return self.directInventory;
      } catch (e) {
        console.warn(self.title + ': invalid inventory cache ignored', e);
        return null;
      }
    };

    self.storeDirectInventoryCache = function (keyMap) {
      var now = Date.now();
      self.directInventory = {
        keyMap: keyMap,
        updatedAt: now,
        expiresAt: now + self.CACHE_TTL_MS,
        error: ''
      };
      try {
        localStorage.setItem(self.CACHE_KEY, JSON.stringify(self.directInventory));
      } catch (e) {
        console.warn(self.title + ': could not store inventory cache', e);
      }
      return self.directInventory;
    };

    self.hasFreshDirectInventory = function () {
      return !!(
        self.directInventory &&
        self.isObject(self.directInventory.keyMap) &&
        self.directInventory.expiresAt > Date.now()
      );
    };

    self.postAjaxPromise = function (endpoint, data) {
      return new Promise(function (resolve, reject) {
        if (typeof window.postAjax !== 'function') {
          reject(new Error('IITC postAjax 不可用'));
          return;
        }
        window.postAjax(
          endpoint,
          data || {},
          function (response) {
            resolve(response);
          },
          function (jqXHR, textStatus, errorThrown) {
            var detail = errorThrown || textStatus || (jqXHR && jqXHR.statusText) || '请求失败';
            reject(new Error(endpoint + ': ' + detail));
          }
        );
      });
    };

    self.addInventoryKey = function (keyMap, entity, amount, capsuleId) {
      if (!Array.isArray(entity) || !entity[2]) return;
      var data = entity[2];
      if (!data.resource || data.resource.resourceType !== 'PORTAL_LINK_KEY' || !data.portalCoupler) return;

      var guid = data.portalCoupler.portalGuid;
      if (!guid) return;
      var increment = self.toNonNegativeInteger(amount);
      if (!increment) return;

      if (!keyMap[guid]) {
        keyMap[guid] = {
          count: 0,
          outside: 0,
          inCapsules: 0,
          capsules: {},
          portalTitle: data.portalCoupler.portalTitle || '',
          portalLocation: data.portalCoupler.portalLocation || ''
        };
      }

      keyMap[guid].count += increment;
      if (capsuleId) {
        keyMap[guid].inCapsules += increment;
        keyMap[guid].capsules[capsuleId] = (keyMap[guid].capsules[capsuleId] || 0) + increment;
      } else {
        keyMap[guid].outside += increment;
      }
    };

    self.parseInventory = function (response) {
      if (!response || !Array.isArray(response.result)) {
        throw new Error('getInventory 返回了无法识别的数据');
      }

      var keyMap = {};
      response.result.forEach(function (entity) {
        self.addInventoryKey(keyMap, entity, 1, '');

        var data = Array.isArray(entity) ? entity[2] : null;
        var stackableItems = data && data.container && data.container.stackableItems;
        if (!Array.isArray(stackableItems)) return;

        var capsuleId = data.moniker && data.moniker.differentiator ? data.moniker.differentiator : 'unknown-capsule';
        stackableItems.forEach(function (stack) {
          if (!stack || !Array.isArray(stack.exampleGameEntity)) return;
          var amount = Array.isArray(stack.itemGuids) ? stack.itemGuids.length : 0;
          self.addInventoryKey(keyMap, stack.exampleGameEntity, amount, capsuleId);
        });
      });
      return keyMap;
    };

    self.refreshInventory = function (force) {
      if (!force && self.hasFreshDirectInventory()) return Promise.resolve({ cached: true, inventory: self.directInventory });
      if (self.refreshPromise) return self.refreshPromise;

      self.setInventoryMessage('正在检查 C.O.R.E. 订阅…', 'working');
      self.refreshPromise = self.postAjaxPromise('getHasActiveSubscription', {})
        .then(function (subscription) {
          if (!subscription || subscription.result !== true) throw new Error('当前账号没有有效的 C.O.R.E. 订阅');
          self.setInventoryMessage('正在读取 C.O.R.E. Inventory…', 'working');
          return self.postAjaxPromise('getInventory', { lastQueryTimestamp: 0 });
        })
        .then(function (inventoryResponse) {
          var keyMap = self.parseInventory(inventoryResponse);
          var inventory = self.storeDirectInventoryCache(keyMap);
          self.setInventoryMessage('C.O.R.E. Inventory 已刷新。', 'ok');
          self.renderInventoryStatus();
          return { cached: false, inventory: inventory };
        })
        .catch(function (error) {
          if (self.directInventory) self.directInventory.error = error.message;
          self.setInventoryMessage('库存读取失败：' + error.message + '；导出时将回退到 Keys 插件或 0。', 'error');
          self.renderInventoryStatus();
          throw error;
        })
        .finally(function () {
          self.refreshPromise = null;
        });
      return self.refreshPromise;
    };

    self.getKeySource = function () {
      var liveMap = self.getLiveInventoryMap();
      if (liveMap) return { type: 'live', label: 'Live Inventory', keyMap: liveMap };
      if (self.hasFreshDirectInventory()) return { type: 'core', label: 'C.O.R.E. 缓存', keyMap: self.directInventory.keyMap };
      if (window.plugin && window.plugin.keys && self.isObject(window.plugin.keys.keys)) {
        return { type: 'keys', label: 'IITC Keys（手工）', keyMap: window.plugin.keys.keys };
      }
      return { type: 'zero', label: '无库存数据（0）', keyMap: null };
    };

    self.getKeyCount = function (guid) {
      if (!guid) return 0;
      var source = self.getKeySource();
      if (source.type === 'live' || source.type === 'core') {
        var entry = source.keyMap[guid];
        return entry ? self.toNonNegativeInteger(entry.count) : 0;
      }
      if (source.type === 'keys') return self.toNonNegativeInteger(source.keyMap[guid]);
      return 0;
    };

    self.setInventoryMessage = function (message, kind) {
      var element = document.getElementById('mpe-inventory-message');
      if (!element) return;
      element.className = 'mpe-message mpe-' + (kind || 'info');
      element.textContent = message || '';
    };

    self.renderInventoryStatus = function () {
      var element = document.getElementById('mpe-inventory-status');
      if (!element) return;

      var source = self.getKeySource();
      var html = '<strong>当前钥匙来源：</strong>' + self.escapeHtml(source.label);
      if (source.type === 'live' || source.type === 'core') {
        var summary = self.summarizeKeyMap(source.keyMap);
        html += '<br>Portal：' + summary.portals + '；Key 总数：' + summary.total;
        if (summary.hasBreakdown) html += '（普通背包 ' + summary.outside + ' + Capsule/Locker ' + summary.inCapsules + '）';
      }

      if (source.type === 'core' && self.directInventory) {
        html += '<br>更新时间：' + self.escapeHtml(self.formatDateTime(self.directInventory.updatedAt));
        html += '；缓存到期：' + self.escapeHtml(self.formatDateTime(self.directInventory.expiresAt));
      } else if (self.directInventory && self.directInventory.expiresAt <= Date.now()) {
        html += '<br><span class="mpe-warn">本插件的 C.O.R.E. 缓存已过期，不会用于导出。</span>';
      }

      element.innerHTML = html;
    };

    // ------------------------------------------------------------------------
    // Portal and Draw Tools data
    // ------------------------------------------------------------------------

    self.portalIdentity = function (portal) {
      if (portal.guid) return 'g:' + portal.guid;
      return 'p:' + Number(portal.lat).toFixed(6) + ',' + Number(portal.lng).toFixed(6);
    };

    self.getLoadedPortals = function () {
      var result = [];
      var portals = window.portals || {};
      Object.keys(portals).forEach(function (guid) {
        var marker = portals[guid];
        if (!marker || typeof marker.getLatLng !== 'function') return;
        var latlng = marker.getLatLng();
        var data = marker.options && marker.options.data ? marker.options.data : {};
        result.push({
          guid: guid,
          title: data.title || marker.label || 'Untitled Portal',
          lat: Number(latlng.lat),
          lng: Number(latlng.lng),
          origin: 'loaded'
        });
      });
      return result;
    };

    self.getBookmarkObject = function () {
      var bookmarks = window.plugin && window.plugin.bookmarks;
      if (bookmarks && self.isObject(bookmarks.bkmrksObj) && self.isObject(bookmarks.bkmrksObj.portals)) {
        return bookmarks.bkmrksObj;
      }
      try {
        var parsed = JSON.parse(localStorage.getItem('plugin-bookmarks') || 'null');
        if (self.isObject(parsed) && self.isObject(parsed.portals)) return parsed;
      } catch (e) {
        console.warn(self.title + ': could not read Bookmarks', e);
      }
      return null;
    };

    self.getBookmarkFolders = function () {
      var object = self.getBookmarkObject();
      var folders = [];
      if (!object) return folders;
      Object.keys(object.portals).forEach(function (id) {
        var folder = object.portals[id];
        if (!folder || !self.isObject(folder.bkmrk)) return;
        folders.push({ id: id, label: folder.label || id, count: Object.keys(folder.bkmrk).length });
      });
      return folders;
    };

    self.getBookmarkPortals = function (folderId) {
      var object = self.getBookmarkObject();
      var result = [];
      if (!object) return result;

      Object.keys(object.portals).forEach(function (id) {
        if (folderId && id !== folderId) return;
        var folder = object.portals[id];
        if (!folder || !self.isObject(folder.bkmrk)) return;
        Object.keys(folder.bkmrk).forEach(function (bookmarkId) {
          var bookmark = folder.bkmrk[bookmarkId];
          if (!bookmark || typeof bookmark.latlng !== 'string') return;
          var parts = bookmark.latlng.split(',');
          var lat = Number(parts[0]);
          var lng = Number(parts[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          result.push({
            guid: bookmark.guid || '',
            title: bookmark.label || 'Untitled Portal',
            lat: lat,
            lng: lng,
            origin: 'bookmark',
            folderId: id
          });
        });
      });
      return result;
    };

    self.mergePortals = function (lists) {
      var map = {};
      var order = [];
      lists.forEach(function (list) {
        list.forEach(function (portal) {
          var id = self.portalIdentity(portal);
          if (!map[id]) {
            map[id] = portal;
            order.push(id);
          } else if (map[id].origin !== 'loaded' && portal.origin === 'loaded') {
            map[id] = portal;
          }
        });
      });
      return order.map(function (id) { return map[id]; });
    };

    self.getPortalCandidates = function () {
      return self.mergePortals([self.getLoadedPortals(), self.getBookmarkPortals('')]);
    };

    self.isLatLng = function (value) {
      return value && self.isFiniteNumber(value.lat) && self.isFiniteNumber(value.lng);
    };

    self.flattenLatLngs = function (value, output) {
      output = output || [];
      if (self.isLatLng(value)) {
        output.push(window.L.latLng(Number(value.lat), Number(value.lng)));
      } else if (Array.isArray(value)) {
        value.forEach(function (item) { self.flattenLatLngs(item, output); });
      }
      return output;
    };

    self.getDrawLayers = function () {
      var drawTools = window.plugin && window.plugin.drawTools;
      if (!drawTools || !drawTools.drawnItems || typeof drawTools.drawnItems.eachLayer !== 'function') {
        throw new Error('Draw Tools 未安装或尚未加载');
      }
      var layers = [];
      drawTools.drawnItems.eachLayer(function (layer) { layers.push(layer); });
      return layers;
    };

    self.isCircleLayer = function (layer) {
      return !!(layer && typeof layer.getLatLng === 'function' && typeof layer.getRadius === 'function');
    };

    self.isPolygonLayer = function (layer) {
      if (!layer || self.isCircleLayer(layer) || typeof layer.getLatLngs !== 'function') return false;
      if (window.L && window.L.Polygon && layer instanceof window.L.Polygon) return true;
      if (window.L && window.L.GeodesicPolygon && layer instanceof window.L.GeodesicPolygon) return true;
      return !!(layer.options && layer.options.fill === true);
    };

    self.isMarkerLayer = function (layer) {
      return !!(
        layer &&
        typeof layer.getLatLng === 'function' &&
        typeof layer.getLatLngs !== 'function' &&
        !self.isCircleLayer(layer)
      );
    };

    self.getDrawVertices = function (layers) {
      var vertices = [];
      layers.forEach(function (layer) {
        if (self.isMarkerLayer(layer)) {
          vertices.push(layer.getLatLng());
        } else if (!self.isCircleLayer(layer) && typeof layer.getLatLngs === 'function') {
          self.flattenLatLngs(layer.getLatLngs(), vertices);
        }
      });

      var unique = [];
      vertices.forEach(function (vertex) {
        var duplicate = unique.some(function (existing) { return existing.distanceTo(vertex) < 0.5; });
        if (!duplicate) unique.push(vertex);
      });
      return unique;
    };

    self.getAreaLayers = function (layers) {
      return layers.filter(function (layer) { return self.isCircleLayer(layer) || self.isPolygonLayer(layer); });
    };

    self.pointInRing = function (point, ring) {
      var inside = false;
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var xi = Number(ring[i].lng);
        var yi = Number(ring[i].lat);
        var xj = Number(ring[j].lng);
        var yj = Number(ring[j].lat);
        var intersects = ((yi > point.lat) !== (yj > point.lat)) &&
          (point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi);
        if (intersects) inside = !inside;
      }
      return inside;
    };

    self.normalisePolygonGroups = function (latlngs) {
      if (!Array.isArray(latlngs) || !latlngs.length) return [];
      if (self.isLatLng(latlngs[0])) return [[latlngs]];
      if (Array.isArray(latlngs[0]) && latlngs[0].length && self.isLatLng(latlngs[0][0])) return [latlngs];
      var groups = [];
      latlngs.forEach(function (part) {
        groups = groups.concat(self.normalisePolygonGroups(part));
      });
      return groups;
    };

    self.portalInsideLayer = function (portal, layer) {
      var point = window.L.latLng(portal.lat, portal.lng);
      if (self.isCircleLayer(layer)) return point.distanceTo(layer.getLatLng()) <= Number(layer.getRadius());
      if (!self.isPolygonLayer(layer)) return false;
      if (typeof layer.getBounds === 'function' && !layer.getBounds().contains(point)) return false;

      var groups = self.normalisePolygonGroups(layer.getLatLngs());
      return groups.some(function (rings) {
        if (!rings.length || !self.pointInRing(point, rings[0])) return false;
        for (var i = 1; i < rings.length; i += 1) {
          if (self.pointInRing(point, rings[i])) return false;
        }
        return true;
      });
    };

    self.matchVertices = function (vertices, candidates, maxDistance) {
      var matched = [];
      var unmatched = [];

      vertices.forEach(function (vertex, index) {
        var best = null;
        var bestDistance = Infinity;
        candidates.forEach(function (portal) {
          var distance = vertex.distanceTo(window.L.latLng(portal.lat, portal.lng));
          if (distance < bestDistance) {
            best = portal;
            bestDistance = distance;
          }
        });

        if (best && bestDistance <= maxDistance) {
          matched.push(best);
        } else {
          unmatched.push({
            index: index + 1,
            lat: vertex.lat,
            lng: vertex.lng,
            nearestTitle: best ? best.title : '',
            nearestDistance: Number.isFinite(bestDistance) ? bestDistance : null
          });
        }
      });

      return { portals: self.mergePortals([matched]), unmatched: unmatched };
    };

    self.collectSelection = function (mode, maxDistance, folderId) {
      if (mode === 'bookmarks') {
        if (!folderId) throw new Error('请选择一个 Bookmarks 文件夹');
        return {
          portals: self.mergePortals([self.getBookmarkPortals(folderId)]),
          unmatched: [],
          vertexCount: 0,
          areaCount: 0,
          notes: []
        };
      }

      var layers = self.getDrawLayers();
      if (!layers.length) throw new Error('Draw Tools 中没有图形');
      var candidates = self.getPortalCandidates();
      var result = { portals: [], unmatched: [], vertexCount: 0, areaCount: 0, notes: [] };

      if (mode === 'vertices' || mode === 'combined') {
        var vertices = self.getDrawVertices(layers);
        var vertexMatches = self.matchVertices(vertices, candidates, maxDistance);
        result.vertexCount = vertices.length;
        result.portals = result.portals.concat(vertexMatches.portals);
        result.unmatched = vertexMatches.unmatched;
        if (!vertices.length) result.notes.push('没有找到可匹配的线段、图形顶点或 Marker。圆形只参与区域导出。');
      }

      if (mode === 'areas' || mode === 'combined') {
        var areas = self.getAreaLayers(layers);
        result.areaCount = areas.length;
        var inside = candidates.filter(function (portal) {
          return areas.some(function (layer) { return self.portalInsideLayer(portal, layer); });
        });
        result.portals = result.portals.concat(inside);
        result.notes.push('区域结果仅包含 IITC 当前已加载的 Portal 与 Bookmarks；请先移动/缩放地图以加载完整数据。');
        if (!areas.length) result.notes.push('Draw Tools 中没有多边形、矩形或圆形区域。');
      }

      result.portals = self.mergePortals([result.portals]);
      return result;
    };

    // ------------------------------------------------------------------------
    // Maxfield formatting and UI
    // ------------------------------------------------------------------------

    self.cleanPortalName = function (name) {
      var cleaned = String(name || 'Untitled Portal')
        .replace(/[;#]/g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned || 'Untitled Portal';
    };

    self.makeUniqueNames = function (portals) {
      var used = {};
      var renamed = 0;
      return portals.map(function (portal) {
        var base = self.cleanPortalName(portal.title);
        var name = base;
        var suffix = 2;
        while (used[name.toLocaleLowerCase()]) {
          name = base + ' (' + suffix + ')';
          suffix += 1;
        }
        if (name !== base) renamed += 1;
        used[name.toLocaleLowerCase()] = true;
        var copy = Object.assign({}, portal);
        copy.exportName = name;
        return copy;
      }).map(function (portal, index, array) {
        if (index === array.length - 1) portal._renamedTotal = renamed;
        return portal;
      });
    };

    self.formatCoordinate = function (value) {
      return Number(value).toFixed(6);
    };

    self.formatPortalLine = function (portal, includeKeys) {
      var lat = self.formatCoordinate(portal.lat);
      var lng = self.formatCoordinate(portal.lng);
      var url = 'https://intel.ingress.com/intel?ll=' + lat + ',' + lng + '&z=17&pll=' + lat + ',' + lng;
      var line = portal.exportName + '; ' + url;
      if (includeKeys) line += '; ' + self.getKeyCount(portal.guid);
      return line;
    };

    self.getDialogValues = function () {
      var root = document.getElementById(self.id + '-root');
      if (!root) throw new Error('导出窗口已关闭');
      var distance = Number(root.querySelector('#mpe-distance').value);
      return {
        mode: root.querySelector('#mpe-mode').value,
        maxDistance: Number.isFinite(distance) && distance > 0 ? distance : self.DEFAULT_MATCH_DISTANCE,
        folderId: root.querySelector('#mpe-bookmark-folder').value,
        includeKeys: root.querySelector('#mpe-include-keys').checked
      };
    };

    self.renderResultStatus = function (selection, renamed) {
      var element = document.getElementById('mpe-result-status');
      if (!element) return;
      var parts = [];
      parts.push('<strong>已生成 ' + selection.portals.length + ' 个 Portal。</strong>');
      if (selection.vertexCount) parts.push('Draw Tools 顶点：' + selection.vertexCount + '。');
      if (selection.areaCount) parts.push('区域图形：' + selection.areaCount + '。');
      if (renamed) parts.push('重名处理：' + renamed + ' 个名称已添加序号。');

      if (selection.unmatched.length) {
        parts.push('<div class="mpe-warn"><strong>未匹配顶点：' + selection.unmatched.length + '</strong></div>');
        parts.push('<details><summary>查看未匹配顶点</summary><ol class="mpe-unmatched">' +
          selection.unmatched.map(function (item) {
            var nearest = item.nearestTitle
              ? '；最近：' + self.escapeHtml(item.nearestTitle) + '（' + Math.round(item.nearestDistance) + ' m）'
              : '；附近没有可用 Portal';
            return '<li>' + self.escapeHtml(self.formatCoordinate(item.lat) + ',' + self.formatCoordinate(item.lng)) + nearest + '</li>';
          }).join('') + '</ol></details>');
      }

      selection.notes.forEach(function (note) {
        parts.push('<div class="mpe-warn">' + self.escapeHtml(note) + '</div>');
      });
      element.innerHTML = parts.join(' ');
    };

    self.regenerate = function (promptForUnmatched) {
      try {
        var values = self.getDialogValues();
        var selection = self.collectSelection(values.mode, values.maxDistance, values.folderId);
        if (promptForUnmatched && selection.unmatched.length) {
          var proceed = window.confirm(
            '有 ' + selection.unmatched.length + ' 个 Draw Tools 顶点未在 ' + values.maxDistance + ' 米内匹配到 Portal。\n\n是否继续生成只包含已匹配 Portal 的列表？'
          );
          if (!proceed) return false;
        }

        var namedPortals = self.makeUniqueNames(selection.portals);
        var renamed = namedPortals.length ? (namedPortals[namedPortals.length - 1]._renamedTotal || 0) : 0;
        var text = namedPortals.map(function (portal) {
          return self.formatPortalLine(portal, values.includeKeys);
        }).join('\n');

        var textarea = document.getElementById('mpe-output');
        if (textarea) textarea.value = text;
        selection.portals = namedPortals;
        self.lastResult = {
          selection: selection,
          unmatchedAcknowledged: promptForUnmatched || selection.unmatched.length === 0
        };
        self.renderResultStatus(selection, renamed);
        self.renderInventoryStatus();
        self.saveSettings();
        return true;
      } catch (error) {
        var status = document.getElementById('mpe-result-status');
        if (status) status.innerHTML = '<span class="mpe-error">' + self.escapeHtml(error.message) + '</span>';
        self.lastResult = null;
        return false;
      }
    };

    self.confirmUnmatched = function () {
      if (!self.lastResult || !self.lastResult.selection.unmatched.length || self.lastResult.unmatchedAcknowledged) return true;
      var count = self.lastResult.selection.unmatched.length;
      var proceed = window.confirm('仍有 ' + count + ' 个顶点未匹配。是否继续复制或下载当前列表？');
      if (proceed) self.lastResult.unmatchedAcknowledged = true;
      return proceed;
    };

    self.getOutputText = function () {
      var textarea = document.getElementById('mpe-output');
      return textarea ? textarea.value.replace(/\r\n/g, '\n').trim() : '';
    };

    self.copyOutput = function () {
      if (!self.confirmUnmatched()) return;
      var text = self.getOutputText();
      if (!text) {
        window.alert('当前没有可复制的 Portal 列表。');
        return;
      }

      var fallback = function () {
        var textarea = document.getElementById('mpe-output');
        textarea.focus();
        textarea.select();
        var ok = document.execCommand('copy');
        window.alert(ok ? '已复制到剪贴板。' : '自动复制失败，请手动复制文本框内容。');
      };

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
          .then(function () { window.alert('已复制到剪贴板。'); })
          .catch(fallback);
      } else {
        fallback();
      }
    };

    self.downloadOutput = function () {
      if (!self.confirmUnmatched()) return;
      var text = self.getOutputText();
      if (!text) {
        window.alert('当前没有可下载的 Portal 列表。');
        return;
      }

      var blob = new Blob(['\uFEFF' + text + '\n'], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'maxfield-portals.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    self.updateModeControls = function () {
      var root = document.getElementById(self.id + '-root');
      if (!root) return;
      var mode = root.querySelector('#mpe-mode').value;
      root.querySelector('#mpe-distance-wrap').style.display = (mode === 'vertices' || mode === 'combined') ? '' : 'none';
      root.querySelector('#mpe-bookmark-wrap').style.display = mode === 'bookmarks' ? '' : 'none';
    };

    self.buildFolderOptions = function (selected) {
      var folders = self.getBookmarkFolders();
      if (!folders.length) return '<option value="">未找到 Bookmarks 文件夹</option>';
      return folders.map(function (folder) {
        var isSelected = selected === folder.id ? ' selected' : '';
        return '<option value="' + self.escapeHtml(folder.id) + '"' + isSelected + '>' +
          self.escapeHtml(folder.label) + ' (' + folder.count + ')</option>';
      }).join('');
    };

    self.openDialog = function () {
      var settings = self.loadSettings();
      var folders = self.getBookmarkFolders();
      if (!settings.bookmarkFolder && folders.length) settings.bookmarkFolder = folders[0].id;

      var html = '' +
        '<div id="' + self.id + '-root" class="mpe-root">' +
          '<div class="mpe-grid">' +
            '<label>导出范围<select id="mpe-mode">' +
              '<option value="vertices"' + (settings.mode === 'vertices' ? ' selected' : '') + '>Draw Tools 顶点</option>' +
              '<option value="areas"' + (settings.mode === 'areas' ? ' selected' : '') + '>Draw Tools 区域内</option>' +
              '<option value="combined"' + (settings.mode === 'combined' ? ' selected' : '') + '>顶点 + 区域（合并）</option>' +
              '<option value="bookmarks"' + (settings.mode === 'bookmarks' ? ' selected' : '') + '>Bookmarks 文件夹</option>' +
            '</select></label>' +
            '<label id="mpe-distance-wrap">顶点匹配距离（米）<input id="mpe-distance" type="number" min="1" step="1" value="' + self.escapeHtml(settings.matchDistance) + '"></label>' +
            '<label id="mpe-bookmark-wrap">Bookmarks 文件夹<select id="mpe-bookmark-folder">' + self.buildFolderOptions(settings.bookmarkFolder) + '</select></label>' +
            '<label class="mpe-checkbox"><input id="mpe-include-keys" type="checkbox"' + (settings.includeKeys ? ' checked' : '') + '>包含已有 Key 数量</label>' +
          '</div>' +
          '<div class="mpe-actions">' +
            '<button id="mpe-regenerate" type="button">重新生成</button>' +
            '<button id="mpe-copy" type="button">复制</button>' +
            '<button id="mpe-download" type="button">下载 TXT</button>' +
          '</div>' +
          '<div id="mpe-result-status" class="mpe-panel"></div>' +
          '<textarea id="mpe-output" rows="16" spellcheck="false" placeholder="Portal名称; Intel URL; Key数量"></textarea>' +
          '<fieldset class="mpe-inventory"><legend>C.O.R.E. Inventory</legend>' +
            '<div id="mpe-inventory-status"></div>' +
            '<div class="mpe-actions">' +
              '<button id="mpe-refresh" type="button">刷新库存（遵守缓存）</button>' +
              '<button id="mpe-force-refresh" type="button">强制刷新</button>' +
            '</div>' +
            '<div id="mpe-inventory-message" class="mpe-message"></div>' +
          '</fieldset>' +
          '<p class="mpe-help">钥匙优先级：Live Inventory → 本插件有效的 C.O.R.E. 缓存 → IITC Keys → 0。普通背包与 Capsule/Key Locker 中同一 Portal 的 Key 会合并统计。</p>' +
        '</div>';

      window.dialog({
        id: self.id,
        title: self.title + ' v' + self.version,
        html: html,
        width: Math.min(760, Math.max(320, window.innerWidth - 30))
      });

      var root = document.getElementById(self.id + '-root');
      root.querySelector('#mpe-mode').addEventListener('change', function () {
        self.updateModeControls();
        self.regenerate(false);
      });
      root.querySelector('#mpe-bookmark-folder').addEventListener('change', function () { self.regenerate(false); });
      root.querySelector('#mpe-include-keys').addEventListener('change', function () { self.regenerate(false); });
      root.querySelector('#mpe-regenerate').addEventListener('click', function () { self.regenerate(true); });
      root.querySelector('#mpe-copy').addEventListener('click', self.copyOutput);
      root.querySelector('#mpe-download').addEventListener('click', self.downloadOutput);
      root.querySelector('#mpe-refresh').addEventListener('click', function () {
        self.refreshInventory(false)
          .then(function (result) {
            if (result.cached) self.setInventoryMessage('10 分钟缓存仍有效，未重复请求 Intel。', 'ok');
            self.regenerate(false);
          })
          .catch(function () {});
      });
      root.querySelector('#mpe-force-refresh').addEventListener('click', function () {
        if (!window.confirm('强制刷新会忽略 10 分钟缓存并立即请求 Intel Inventory。是否继续？')) return;
        self.refreshInventory(true).then(function () { self.regenerate(false); }).catch(function () {});
      });

      self.updateModeControls();
      self.renderInventoryStatus();
      self.regenerate(false);
    };

    self.injectCss = function () {
      if (document.getElementById(self.id + '-style')) return;
      var style = document.createElement('style');
      style.id = self.id + '-style';
      style.textContent = '' +
        '.mpe-root{font-size:13px;line-height:1.4}' +
        '.mpe-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}' +
        '.mpe-grid label{display:flex;flex-direction:column;gap:3px}' +
        '.mpe-grid .mpe-checkbox{flex-direction:row;align-items:center;align-self:end;padding-bottom:4px}' +
        '.mpe-root select,.mpe-root input[type=number]{box-sizing:border-box;width:100%}' +
        '.mpe-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}' +
        '.mpe-actions button{padding:4px 10px}' +
        '.mpe-panel,.mpe-inventory{margin:8px 0;padding:8px;border:1px solid #20a8b1}' +
        '.mpe-root textarea{box-sizing:border-box;width:100%;min-height:220px;resize:vertical;white-space:pre;font-family:monospace}' +
        '.mpe-warn{color:#ffce00;margin-top:4px}' +
        '.mpe-error{color:#ff6666;font-weight:bold}' +
        '.mpe-ok{color:#7ee787}.mpe-working{color:#79c0ff}' +
        '.mpe-message{margin-top:5px}' +
        '.mpe-unmatched{max-height:150px;overflow:auto;margin:5px 0;padding-left:24px}' +
        '.mpe-help{opacity:.85;margin:8px 0 0}' +
        '@media(max-width:600px){.mpe-grid{grid-template-columns:1fr}.mpe-root textarea{min-height:180px}}';
      document.head.appendChild(style);
    };

    self.autoLoadInventory = function () {
      self.loadDirectInventoryCache();
      setTimeout(function () {
        // If Live Inventory is installed, let it perform its own cached refresh.
        // Its keyMap remains the preferred source as soon as it becomes available.
        if ((window.plugin && window.plugin.LiveInventory) || self.hasFreshDirectInventory()) return;
        self.refreshInventory(false).catch(function () {});
      }, 1500);
    };

    self.setup = function () {
      if (self.setupDone) return;
      self.setupDone = true;
      self.injectCss();
      self.autoLoadInventory();

      if (window.IITC && window.IITC.toolbox && typeof window.IITC.toolbox.addButton === 'function') {
        window.IITC.toolbox.addButton({
          id: 'toolbox-maxfield-portal-exporter',
          label: 'Maxfield Export',
          title: 'Export Draw Tools or Bookmarks portals for Maxfield',
          action: self.openDialog
        });
      } else {
        var link = document.createElement('a');
        link.textContent = 'Maxfield Export';
        link.title = 'Export Draw Tools or Bookmarks portals for Maxfield';
        link.href = '#';
        link.addEventListener('click', function (event) {
          event.preventDefault();
          self.openDialog();
        });
        var toolbox = document.getElementById('toolbox');
        if (toolbox) toolbox.appendChild(link);
      }

      if (typeof window.addHook === 'function') {
        window.addHook('pluginLiveInventoryUpdated', function () {
          self.renderInventoryStatus();
        });
      }
      console.log(self.title + ' v' + self.version + ' loaded');
    };

    if (window.iitcLoaded) {
      self.setup();
    } else {
      window.bootPlugins = window.bootPlugins || [];
      window.bootPlugins.push(self.setup);
    }
  }

  var script = document.createElement('script');
  script.appendChild(document.createTextNode('(' + wrapper + ')();'));
  (document.body || document.head || document.documentElement).appendChild(script);
})();

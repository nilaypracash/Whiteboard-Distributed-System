// main.js - frontend whiteboard logic (runs in browser)
/* global Y */

let ws = null;
let ydoc = null;
let shapes = null;
let roomId = 'room1';
let currentTool = 'pen';
let currentColor = '#ffffff';
let isDrawing = false;
let startX = 0, startY = 0;
let tempShape = null;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const colorPicker = document.getElementById('colorPicker');

document.querySelectorAll('button[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTool = btn.getAttribute('data-tool');
  });
});

colorPicker.addEventListener('input', (e) => {
  currentColor = e.target.value;
});

joinBtn.addEventListener('click', () => {
  roomId = roomInput.value || 'room1';
  connect();
});

function connect() {
  if (ws) ws.close();
  ydoc = new Y.Doc();
  shapes = ydoc.getArray('shapes');

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.host}/?room=${encodeURIComponent(roomId)}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    statusEl.textContent = `Connected (${roomId})`;
  };
  ws.onclose = () => {
    statusEl.textContent = 'Disconnected';
  };
  ws.onerror = () => {
    statusEl.textContent = 'Error';
  };
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'sync-step-1' || data.type === 'yjs-update') {
        const update = Uint8Array.from(atob(data.update), c => c.charCodeAt(0));
        Y.applyUpdate(ydoc, update);
      }
    } catch (e) {
      console.error('ws message parse error', e);
    }
  };

  // send local updates to server
  ydoc.on('update', (update) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const b64 = btoa(String.fromCharCode(...update));
      ws.send(JSON.stringify({ type: 'yjs-update', update: b64 }));
    }
  });

  // re-render whenever shapes change
  shapes.observe(renderAll);
}

function renderAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  shapes.forEach(s => {
    if (s.type === 'stroke') {
      ctx.beginPath();
      ctx.strokeStyle = s.color || '#fff';
      ctx.lineWidth = s.width || 2;
      const pts = s.points;
      if (pts && pts.length) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (s.type === 'rect') {
      ctx.strokeStyle = s.color || '#fff';
      ctx.lineWidth = s.width || 2;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === 'text') {
      ctx.fillStyle = s.color || '#fff';
      ctx.font = '16px sans-serif';
      ctx.fillText(s.text || '', s.x, s.y);
    }
  });
}

// drawing handlers
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  isDrawing = true;
  startX = x;
  startY = y;

  if (currentTool === 'pen') {
    tempShape = { type: 'stroke', color: currentColor, width: 2, points: [{ x, y }] };
    shapes.push([tempShape]);
  } else if (currentTool === 'rect') {
    tempShape = { type: 'rect', color: currentColor, width: 2, x, y, w: 0, h: 0 };
    shapes.push([tempShape]);
  } else if (currentTool === 'text') {
    const text = prompt('Enter text:');
    if (text) {
      const s = { type: 'text', color: currentColor, x, y, text };
      shapes.push([s]);
    }
    isDrawing = false;
    tempShape = null;
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing || !tempShape) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (tempShape.type === 'stroke') {
    tempShape.points.push({ x, y });
  } else if (tempShape.type === 'rect') {
    tempShape.w = x - startX;
    tempShape.h = y - startY;
  }

  // replace last shape to trigger Yjs update
  const idx = shapes.length - 1;
  shapes.delete(idx, 1);
  shapes.push([tempShape]);
});

window.addEventListener('mouseup', () => {
  isDrawing = false;
  tempShape = null;
});

// connect on first load
connect();

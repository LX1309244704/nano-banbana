import React, { useState, useEffect, useRef } from 'react';
import { 
  Layers, 
  History, 
  Image as ImageIcon, 
  Wand2, 
  Edit3, 
  Combine, 
  Download, 
  Settings, 
  Plus, 
  Eye, 
  EyeOff, 
  Trash2, 
  Loader2, 
  Undo2, 
  Redo2, 
  LogOut, 
  Layers as Blend, // 使用 Layers 替代 Blend
  LayoutTemplate, 
  ChevronDown,
  Eraser,
  PenTool,
  Palette,
  Upload,
  Move,
  Scissors,
  Maximize2,
  ScanLine,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Video as VideoIcon,
  PlayCircle,
  Save,
  Clock // 新增 Clock 图标
} from 'lucide-react';

// --- 配置与常量 ---
// 使用统一的 API 端点
const API_BASE_URL = "https://api.jmyps.com";

const GEMINI_TEXT_MODEL = "gemini-2.5-flash-preview-09-2025";
const GEMINI_VISION_MODEL = "gemini-2.5-flash-image-preview"; 
const IMAGEN_MODEL = "gemini-2.5-flash-image-preview"; 
const DB_NAME = 'AIImageCreatorDB';
const DB_STORE = 'images';

// --- IndexedDB Utilities (Local High-Res Cache) ---
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

const saveToIndexedDB = async (id, data) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_STORE], 'readwrite');
      const store = transaction.objectStore(DB_STORE);
      const request = store.put({ id, data, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  } catch (e) {
    console.warn("IndexedDB Save Failed", e);
  }
};

const getFromIndexedDB = async (id) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_STORE], 'readonly');
      const store = transaction.objectStore(DB_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result?.data);
      request.onerror = (e) => resolve(null);
    });
  } catch (e) {
    console.warn("IndexedDB Read Failed", e);
    return null;
  }
};

// Blend Mode Options
const BLEND_MODES = [
  { value: 'normal', label: '正常' },
  { value: 'multiply', label: '正片叠底' },
  { value: 'screen', label: '滤色' },
  { value: 'overlay', label: '叠加' },
  { value: 'darken', label: '变暗' },
  { value: 'lighten', label: '变亮' },
];

// Aspect Ratio Options
const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 (正方形)', width: 1024, height: 1024 },
  { value: '16:9', label: '16:9 (横屏)', width: 1408, height: 792 },
  { value: '9:16', label: '9:16 (竖屏)', width: 792, height: 1408 },
  { value: '4:3', label: '4:3 (标准)', width: 1152, height: 896 },
  { value: '3:4', label: '3:4 (纵向)', width: 896, height: 1152 },
];

// Video Duration Options
// 修改为数字类型，不带 's'
const VIDEO_DURATIONS = [
  { value: 10, label: '10秒' },
  { value: 15, label: '15秒' },
];

// Brush Palette
const BRUSH_PALETTE = [
  { id: 'red', rgba: 'rgba(255, 50, 50, 0.6)', css: 'bg-red-500 ring-red-400', label: '红色' },
  { id: 'green', rgba: 'rgba(50, 255, 50, 0.6)', css: 'bg-green-500 ring-green-400', label: '绿色' },
  { id: 'blue', rgba: 'rgba(80, 100, 255, 0.6)', css: 'bg-blue-500 ring-blue-400', label: '蓝色' },
  { id: 'white', rgba: 'rgba(255, 255, 255, 0.7)', css: 'bg-white ring-slate-400', label: '白色' },
];

export default function App() {
  // --- State Management ---
  const [activeMode, setActiveMode] = useState('generate'); 
  const [prompt, setPrompt] = useState('');
  
  // Canvas & Layers
  const [layers, setLayers] = useState([
    { id: 'bg-1', name: '背景层', visible: true, type: 'background', opacity: 100, blendMode: 'normal', x: 0, y: 0, scale: 1, url: 'https://picsum.photos/800/600?random=init' }
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState('bg-1');
  const [history, setHistory] = useState([]);
  
  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  
  // Interaction State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false); 
  const [errorMsg, setErrorMsg] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1'); 
  const [videoDuration, setVideoDuration] = useState(10); // 修改为数字默认值
  const [brushSize, setBrushSize] = useState(30); 
  const [activeBrush, setActiveBrush] = useState(BRUSH_PALETTE[0]); 
  const [isDrawing, setIsDrawing] = useState(false); 
  const [previewImage, setPreviewImage] = useState(null); 

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('api_key') || '');

  // Preview Modal State
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const [previewDragStart, setPreviewDragStart] = useState({ x: 0, y: 0 });

  // Dragging State (Canvas Layers)
  const [dragState, setDragState] = useState({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialLayerX: 0,
    initialLayerY: 0
  });
  
  const dragStartLayersRef = useRef(null);

  const canvasRef = useRef(null); 
  const maskCanvasRef = useRef(null); 
  const fileInputRef = useRef(null); 

  // --- Helper: Get Target Dimensions ---
  const getTargetDimensions = () => {
    return ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0];
  };

  // Reset Preview on open
  useEffect(() => {
    if (previewImage) {
      setPreviewScale(1);
      setPreviewOffset({ x: 0, y: 0 });
    }
  }, [previewImage]);

  // --- Mode Switching Effects ---
  // Ensure valid aspect ratio when switching to video mode
  useEffect(() => {
    if (activeMode === 'video') {
      if (aspectRatio !== '16:9' && aspectRatio !== '9:16') {
        setAspectRatio('16:9');
      }
    }
  }, [activeMode]);

  // --- Load History from LocalStorage ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('ai_creative_studio_history');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setHistory(parsedHistory);
      } catch (e) {
        console.error("Failed to parse history from local storage", e);
      }
    }
  }, []);

  // --- Clear mask on mode change ---
  useEffect(() => {
    clearMask();
  }, [activeMode, selectedLayerId]);

  // --- History & Undo/Redo Logic ---
  const recordHistory = () => {
    setUndoStack(prev => [...prev, layers]);
    setRedoStack([]); 
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousLayers = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, undoStack.length - 1);
    setRedoStack(prev => [layers, ...prev]); 
    setLayers(previousLayers);
    setUndoStack(newUndoStack);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextLayers = redoStack[0];
    const newRedoStack = redoStack.slice(1);
    setUndoStack(prev => [...prev, layers]);
    setLayers(nextLayers);
    setRedoStack(newRedoStack);
  };

  // --- Mask Drawing Logic ---
  const getCanvasCoordinates = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if (e.nativeEvent?.type?.startsWith('touch')) {
       clientX = e.touches[0].clientX;
       clientY = e.touches[0].clientY;
    } else {
       clientX = e.nativeEvent?.clientX || e.clientX;
       clientY = e.nativeEvent?.clientY || e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (activeMode !== 'mask') return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasCoordinates(e, canvas);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const targetDim = getTargetDimensions();
    const scaleFactor = targetDim.width / 800; 
    ctx.lineWidth = brushSize * scaleFactor; 
    ctx.strokeStyle = activeBrush.rgba;
    
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || activeMode !== 'mask') return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    
    e.preventDefault(); // Prevent scrolling on touch
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasCoordinates(e, canvas);

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const canvas = maskCanvasRef.current;
    if (canvas) {
       const ctx = canvas.getContext('2d');
       ctx.closePath();
    }
    setIsDrawing(false);
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // --- Dragging Logic ---
  const handleDragStart = (e, layerId) => {
    if (activeMode !== 'compose') return;
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type === 'background') return;

    // e.preventDefault(); // Intentionally allowed for some touch interactions, handled in Move
    e.stopPropagation(); 
    dragStartLayersRef.current = layers;
    setSelectedLayerId(layerId);

    let clientX, clientY;
    if (e.type === 'touchstart') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    setDragState({
      isDragging: true,
      startX: clientX,
      startY: clientY,
      initialLayerX: layer.x || 0,
      initialLayerY: layer.y || 0
    });
  };

  const handleDragMove = (e) => {
    if (!dragState.isDragging || activeMode !== 'compose') return;

    let clientX, clientY;
    if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const deltaX = clientX - dragState.startX;
    const deltaY = clientY - dragState.startY;

    setLayers(layers.map(l => 
      l.id === selectedLayerId 
        ? { ...l, x: dragState.initialLayerX + deltaX, y: dragState.initialLayerY + deltaY } 
        : l
    ));
  };

  const handleDragEnd = () => {
    if (dragState.isDragging) {
      if (dragStartLayersRef.current) {
        setUndoStack(prev => [...prev, dragStartLayersRef.current]);
        setRedoStack([]);
        dragStartLayersRef.current = null;
      }
      setDragState(prev => ({ ...prev, isDragging: false }));
    }
  };

  // --- Wheel Zoom for Layers ---
  const handleWheel = (e, layerId) => {
    if (activeMode !== 'compose') return;
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type === 'background') return;
    
    if (selectedLayerId === layerId) {
        e.preventDefault();
        e.stopPropagation();
        const scaleDelta = -e.deltaY * 0.001; 
        const newScale = Math.max(0.1, Math.min(5, (layer.scale || 1) + scaleDelta));
        setLayers(layers.map(l => l.id === layerId ? { ...l, scale: newScale } : l));
    }
  };

  // --- Preview Modal Interactions ---
  const handlePreviewWheel = (e) => {
    e.stopPropagation();
    const scaleDelta = -e.deltaY * 0.001;
    setPreviewScale(prev => Math.max(0.5, Math.min(5, prev + scaleDelta)));
  };

  const handlePreviewMouseDown = (e) => {
    e.preventDefault();
    setIsPreviewDragging(true);
    const clientX = e.clientX || e.touches?.[0].clientX;
    const clientY = e.clientY || e.touches?.[0].clientY;
    setPreviewDragStart({ x: clientX - previewOffset.x, y: clientY - previewOffset.y });
  };

  const handlePreviewMouseMove = (e) => {
    if (!isPreviewDragging) return;
    e.preventDefault();
    const clientX = e.clientX || e.touches?.[0].clientX;
    const clientY = e.clientY || e.touches?.[0].clientY;
    setPreviewOffset({
      x: clientX - previewDragStart.x,
      y: clientY - previewDragStart.y
    });
  };

  const handlePreviewMouseUp = () => {
    setIsPreviewDragging(false);
  };

  const handlePreviewZoom = (delta) => {
    setPreviewScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  // --- Helper: Generate Binary Mask ---
  const getMaskBase64 = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    
    const originalCtx = canvas.getContext('2d');
    const originalData = originalCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = originalData.data;
    
    const binaryData = ctx.createImageData(canvas.width, canvas.height);
    const bData = binaryData.data;
    
    let hasStrokes = false;
    
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        bData[i] = 255; bData[i + 1] = 255; bData[i + 2] = 255; bData[i + 3] = 255; 
        hasStrokes = true;
      } else {
        bData[i] = 0; bData[i + 1] = 0; bData[i + 2] = 0; bData[i + 3] = 255; 
      }
    }
    
    if (!hasStrokes) return null;
    
    ctx.putImageData(binaryData, 0, 0);
    return tempCanvas.toDataURL('image/png').split(',')[1];
  };

  // --- Helper: Get Visual State for AI ---
  const getVisualImageBase64 = (layer, width, height) => {
     return new Promise((resolve, reject) => {
         const tempCanvas = document.createElement('canvas');
         tempCanvas.width = width;
         tempCanvas.height = height;
         const ctx = tempCanvas.getContext('2d');

         ctx.fillStyle = "#000000";
         ctx.fillRect(0, 0, width, height);

         // 如果是视频，截取第一帧（仅简单支持）
         if (layer.type === 'video') {
            const video = document.createElement('video');
            video.src = layer.url;
            video.crossOrigin = "anonymous";
            video.currentTime = 0.1; // Seek a bit
            video.onloadeddata = () => {
                // 简化处理：直接画视频帧，不考虑太复杂的缩放逻辑一致性，
                // 实际应用中需要等待 seek 完成
                ctx.drawImage(video, 0, 0, width, height);
                resolve(tempCanvas.toDataURL('image/png').split(',')[1]);
            };
            video.onerror = () => {
                // 降级或失败
                resolve(null); 
            };
            return;
         }

         const img = new Image();
         img.crossOrigin = "anonymous";
         img.src = layer.url;
         img.onload = () => {
             // Simulate object-contain logic
             const hRatio = width / img.width;
             const vRatio = height / img.height;
             const ratio = Math.min(hRatio, vRatio);
             
             const baseW = img.width * ratio;
             const baseH = img.height * ratio;

             const scale = layer.scale || 1;
             const offsetX = layer.x || 0;
             const offsetY = layer.y || 0;

             const finalW = baseW * scale;
             const finalH = baseH * scale;

             const drawX = (width - finalW) / 2 + offsetX;
             const drawY = (height - finalH) / 2 + offsetY;
             
             ctx.drawImage(img, 0, 0, img.width, img.height, drawX, drawY, finalW, finalH);
             resolve(tempCanvas.toDataURL('image/png').split(',')[1]);
         };
         img.onerror = reject;
     });
  };

  const compressImage = (base64Str, maxWidth = 600, quality = 0.7) => {
    return new Promise((resolve) => {
      // 如果是视频，不压缩直接返回（或处理缩略图）
      // 这里简单判断如果不是 data:image 开头，可能是 URL
      if (!base64Str.startsWith('data:image')) {
          resolve(base64Str);
          return;
      }

      const img = new Image();
      img.src = base64Str;
      img.crossOrigin = "Anonymous"; 
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxWidth) {
            const ratio = Math.min(maxWidth / width, maxWidth / height);
            width *= ratio;
            height *= ratio;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => {
          console.warn("Image compression failed", err);
          resolve(base64Str);
      }
    });
  };

  const urlToBase64 = async (url) => {
    try {
      if (url.startsWith('data:image/')) {
        return url.split(',')[1];
      }
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error("Failed to read image data.");
    }
  };

  const handleUploadImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    recordHistory();

    const reader = new FileReader();
    reader.onload = (event) => {
        const isVideo = file.type.startsWith('video/');
        const newLayer = {
            id: `upload-${Date.now()}`,
            name: `上传: ${file.name.substring(0, 10)}`,
            visible: true,
            type: isVideo ? 'video' : 'overlay',
            opacity: 100, 
            blendMode: 'normal',
            x: 0,
            y: 0,
            scale: 1,
            url: event.target.result
        };
        setLayers(prev => [newLayer, ...prev]);
        setSelectedLayerId(newLayer.id);
        if (activeMode !== 'compose') setActiveMode('compose');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveBackground = async () => {
    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (!selectedLayer) return;
    if (selectedLayer.type === 'video') {
        setErrorMsg("视频图层暂不支持移除背景");
        return;
    }
    
    recordHistory();
    setIsRemovingBg(true);
    setErrorMsg('');

    try {
      const base64Image = await urlToBase64(selectedLayer.url);
      const response = await fetch(
        `${API_BASE_URL}/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Remove the background from this image and return the main subject on a transparent background. Keep the subject intact." },
                { inlineData: { mimeType: "image/png", data: base64Image } }
              ]
            }],
            generationConfig: { responseModalities: ['IMAGE'] }
          })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(`API Error: ${data.error.message}`);

      const resultBase64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

      if (resultBase64) {
        const newUrl = `data:image/png;base64,${resultBase64}`;
        setLayers(layers.map(l => l.id === selectedLayerId ? { ...l, url: newUrl } : l));
      } else {
        throw new Error("移除背景未返回图像。");
      }

    } catch (error) {
      console.error("Remove BG error:", error);
      setErrorMsg(`移除背景失败: ${error.message}`);
    } finally {
      setIsRemovingBg(false);
    }
  };

  // --- History Storage (IndexedDB + LocalStorage) ---
  const addToHistory = async (imageUrl, promptText, type = 'generate') => {
    const historyId = crypto.randomUUID();
    try {
      // 视频 URL 直接存，不做压缩（除非有缩略图生成逻辑）
      const isVideo = type === 'video';
      await saveToIndexedDB(historyId, imageUrl);
      
      const savedUrl = isVideo ? imageUrl : await compressImage(imageUrl, 600, 0.6);
      
      const newItem = {
        id: historyId,
        originalId: historyId,
        url: savedUrl,
        thumbnail: savedUrl, // 视频应该有缩略图，这里简化直接用 URL
        prompt: promptText,
        type: type,
        aspectRatio: aspectRatio,
        createdAt: Date.now()
      };

      const newHistory = [newItem, ...history];
      setHistory(newHistory);
      localStorage.setItem('ai_creative_studio_history', JSON.stringify(newHistory));

    } catch (e) {
      console.error("Save history failed:", e);
    }
  };
  
  const fetchHighQualityImage = async (item) => {
    if (!item.originalId) return item.url;
    const localImage = await getFromIndexedDB(item.originalId);
    return localImage || item.url;
  };

  // --- Settings Handler ---
  const handleSaveSettings = () => {
    localStorage.setItem('api_key', apiKey);
    setShowSettings(false);
    setErrorMsg('配置已保存');
    setTimeout(() => setErrorMsg(''), 2000);
  };

  // --- Video API Functions (Updated with User Config and Duration) ---
  const createVideoTask = async (prompt, aspectRatio, duration, images = []) => {
    // 简单验证
    if (!apiKey) throw new Error("请在设置中配置 API Key");

    console.log('Sora2模型接收到参数:', { prompt, aspectRatio, duration, imagesCount: images.length });
    
    const requestBody = {
        prompt: prompt,
        model: "sora-2",
        aspect_ratio: aspectRatio || "16:9",
        hd: true,
        duration: duration || 10, // 传递数字，默认为 10
        watermark: false,
        ...(images && images.length > 0 && { images: images })
    };

    console.log('Sora2模型发送给API的参数:', requestBody);

    const response = await fetch(`${API_BASE_URL}/v2/videos/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Sora-Version': '2.0' // 关键 header，来自 sora2.ts
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `视频任务创建失败: ${response.status}`);
    }

    const data = await response.json();
    return data.id || data.task_id;
  };

  const pollVideoTask = async (taskId) => {
    if (!taskId) throw new Error("任务ID为空");

    const maxAttempts = 120; // Increased to 120 attempts (10 mins total with 5s interval)
    let attempts = 0;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Increased interval to 5s
        attempts++;

        const response = await fetch(`${API_BASE_URL}/v2/videos/generations/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'X-Sora-Version': '2.0'
            }
        });

        if (!response.ok) continue;

        const result = await response.json();
        // 状态判断逻辑参考 sora2.ts getTask 方法
        const status = result.status?.toUpperCase();

        if (status === 'SUCCESS' || status === 'SUCCESSFUL' || status === 'success') {
            // 尝试从多个路径提取 URL，参考 sora2.ts
            let videoUrl = result.data?.output || 
                           result.output || 
                           result.video_url || 
                           result.url || 
                           result.data?.url;
                           
            if (videoUrl && !videoUrl.startsWith('http')) {
                videoUrl = `${API_BASE_URL}${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
            }
            return videoUrl;
        } else if (status === 'FAILURE' || status === 'FAILED' || status === 'failure') {
            // 错误处理逻辑参考 sora2.ts
            let errorMessage = result.fail_reason || result.error || '视频生成失败';
            if (errorMessage.startsWith('{') && errorMessage.endsWith('}')) {
                try {
                  const errorObj = JSON.parse(errorMessage);
                  errorMessage = errorObj.message || errorObj.error || errorMessage;
                } catch (e) {
                  // 解析失败，保持原样
                }
            }
            throw new Error(errorMessage);
        } else if (['IN_PROGRESS', 'NOT_START', 'PROCESSING', 'in_progress', 'PENDING'].includes(status)) {
            // 继续轮询
            continue;
        } else {
            // 未知状态，继续轮询
            continue;
        }
    }
    throw new Error("视频生成超时，请稍后在历史记录中查看");
  };

  // --- Main Action Handler (Generate/Edit/Mask) ---
  const handleAction = async () => {
    if (!prompt && activeMode !== 'compose') return; 
    
    // --- API Key 检查 ---
    if (!apiKey) {
      setShowSettings(true);
      setErrorMsg("请先配置 API Key");
      return;
    }
    
    recordHistory();
    setIsGenerating(true);
    setErrorMsg('');

    try {
      let newImageUrl = '';
      
      if (activeMode === 'video') {
          // --- 视频生成逻辑 ---
          // 1. 捕获当前画布作为图片
          const canvasDataUrl = await renderCanvasToDataURL();
          
          // 2. 创建视频任务 (带图片和时长参数)
          const taskId = await createVideoTask(prompt, aspectRatio, videoDuration, [canvasDataUrl]);
          
          // 3. 轮询结果
          newImageUrl = await pollVideoTask(taskId);
          
          const newLayer = {
            id: `video-${Date.now()}`,
            name: 'AI 视频',
            visible: true,
            type: 'video', // 新类型
            opacity: 100,
            blendMode: 'normal',
            x: 0, y: 0, scale: 1,
            url: newImageUrl
          };
          setLayers([newLayer]);
          setSelectedLayerId(newLayer.id);

      } else if (activeMode === 'generate') {
      // 将比例格式转换为nano-banana支持的格式
      const getNanoBananaAspectRatio = (ratio) => {
        const ratioMap = {
          '1:1': '1:1',
          '16:9': '16:9', 
          '9:16': '9:16',
          '4:3': '4:3',
          '3:4': '3:4'
        };
        return ratioMap[ratio] || '1:1';
      };

      const response = await fetch(
        `${API_BASE_URL}/v1/images/generations`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'nano-banana',
            prompt: prompt,
            aspect_ratio: getNanoBananaAspectRatio(aspectRatio),
            response_format: 'url'
          })
        }
      );
        
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);

        // nano-banana API 返回格式：直接返回图片URL
        if (data.data && data.data[0] && data.data[0].url) {
          newImageUrl = data.data[0].url;
          
          const newLayer = {
            id: `layer-${Date.now()}`,
            name: '生成背景',
            visible: true,
            type: 'background',
            opacity: 100,
            blendMode: 'normal',
            x: 0, y: 0, scale: 1,
            url: newImageUrl
          };
          setLayers([newLayer]);
          setSelectedLayerId(newLayer.id);
        } else {
          throw new Error("生成请求被拒绝或失败。");
        }

      } else if (activeMode === 'compose') {
        const bgLayer = layers.find(l => l.type === 'background') || layers[layers.length - 1];
        const fgLayer = selectedLayerId && layers.find(l => l.id === selectedLayerId && l.id !== bgLayer.id)
          ? layers.find(l => l.id === selectedLayerId)
          : layers.find(l => l.id !== bgLayer.id); 

        if (!bgLayer) throw new Error("未找到背景图层。");
        if (!fgLayer) throw new Error("请选择或上传前景图层。");

        const bgBase64 = await urlToBase64(bgLayer.url);
        const fgBase64 = await urlToBase64(fgLayer.url);

        const parts = [
          { text: `Act as a professional photo compositor. Composite the object from the second image (foreground) into the first image (background). 
            Instruction: ${prompt || "Place the object naturally into the scene, matching lighting, shadows, and perspective."}
            IMPORTANT: The output image MUST strictly maintain the exact aspect ratio and dimensions of the first image (background). Do not crop, resize, or change the aspect ratio of the background.` },
          { inlineData: { mimeType: "image/png", data: bgBase64 } }, 
          { inlineData: { mimeType: "image/png", data: fgBase64 } }
        ];

      const response = await fetch(
        `${API_BASE_URL}/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            contents: [{ parts: parts }],
            generationConfig: { responseModalities: ['IMAGE'] }
          })
        }
      );
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const resultBase64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        
        if (resultBase64) {
          newImageUrl = `data:image/png;base64,${resultBase64}`;
          const newLayer = {
            id: `composite-${Date.now()}`,
            name: '合成结果',
            visible: true,
            type: 'overlay', 
            opacity: 100,
            blendMode: 'normal',
            x: 0, y: 0, scale: 1,
            url: newImageUrl
          };
          setLayers(prev => [newLayer, ...prev]);
          setSelectedLayerId(newLayer.id);
        } else {
          throw new Error("合成失败。");
        }

      } else if (activeMode === 'mask') {
        const selectedLayer = layers.find(l => l.id === selectedLayerId);
        if (!selectedLayer) throw new Error("请选择一个图层。");

        if (selectedLayer.type === 'video') throw new Error("视频图层暂不支持遮罩重绘");

        const maskCanvas = maskCanvasRef.current;
        if (!maskCanvas) throw new Error("画布未就绪");

        const maskBase64 = getMaskBase64();
        if (!maskBase64) throw new Error("请先绘制遮罩。");

        const visualBase64 = await getVisualImageBase64(selectedLayer, maskCanvas.width, maskCanvas.height);

        const parts = [
          { text: `INPAINTING TASK. Image 1 is Source, Image 2 is Mask (White=Edit, Black=Keep). Instruction: ${prompt} Constraint: Only edit white mask area.` }, 
          { inlineData: { mimeType: "image/png", data: visualBase64 } },
          { inlineData: { mimeType: "image/png", data: maskBase64 } }
        ];
        
      const response = await fetch(
        `${API_BASE_URL}/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            contents: [{ parts: parts }],
            generationConfig: { responseModalities: ['IMAGE'] }
          })
        }
      );
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const resultBase64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        
        if (resultBase64) {
          newImageUrl = `data:image/png;base64,${resultBase64}`;
          setLayers(layers.map(l => l.id === selectedLayerId ? { ...l, url: newImageUrl } : l));
          clearMask();
        } else {
          throw new Error("局部修补失败。");
        }
      }

      if (newImageUrl) {
        await addToHistory(newImageUrl, prompt || activeMode, activeMode);
      }

    } catch (error) {
      console.error("Op error:", error);
      
      // 优化错误提示：针对内容政策错误提供建议
      if (error.message && error.message.includes("此内容可能违反了我们的内容政策")) {
          setErrorMsg("生成失败：提示词包含敏感内容，请修改提示词后重试。");
      } else {
          setErrorMsg(typeof error === 'string' ? error : error.message || "操作失败");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const updateLayer = (id, key, value) => {
    if (key === 'blendMode') {
      recordHistory();
    }
    setLayers(layers.map(l => l.id === id ? { ...l, [key]: value } : l));
  };

  const deleteLayer = (id) => {
    recordHistory();
    const newLayers = layers.filter(l => l.id !== id);
    setLayers(newLayers);
    if (selectedLayerId === id && newLayers.length > 0) {
      setSelectedLayerId(newLayers[0].id);
    }
  };

  const handleAddToCanvas = async (item) => {
    recordHistory();
    const imageUrl = await fetchHighQualityImage(item);
    const newLayer = {
      id: `history-${Date.now()}`,
      name: item.type === 'video' ? `视频: ${item.prompt.slice(0, 8)}...` : `历史: ${item.prompt.slice(0, 8)}...`,
      visible: true,
      type: item.type === 'video' ? 'video' : 'overlay',
      opacity: 100,
      blendMode: 'normal',
      x: 0, y: 0, scale: 1,
      url: imageUrl
    };
    setLayers(prev => [newLayer, ...prev]);
    setSelectedLayerId(newLayer.id);
    if (activeMode !== 'compose') setActiveMode('compose');
  };

  const handlePreview = async (item) => {
      const imageUrl = await fetchHighQualityImage(item);
      setPreviewImage({ ...item, url: imageUrl });
  };

  const handleDeleteHistory = async (item) => {
    try {
      // 从IndexedDB删除高分辨率图片
      if (item.originalId) {
        const db = await initDB();
        const transaction = db.transaction([DB_STORE], 'readwrite');
        const store = transaction.objectStore(DB_STORE);
        store.delete(item.originalId);
      }
      
      // 从历史记录中删除
      const newHistory = history.filter(h => h.id !== item.id);
      setHistory(newHistory);
      localStorage.setItem('ai_creative_studio_history', JSON.stringify(newHistory));
    } catch (error) {
      console.error("删除历史记录失败:", error);
      setErrorMsg("删除失败，请重试");
    }
  };

  const renderCanvasToDataURL = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let width, height;
    
    const targetDim = ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0];
    width = targetDim.width;
    height = targetDim.height;

    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgLayer = layers.find(l => l.type === 'background') || layers[layers.length - 1];

    const layersToDraw = [...layers].reverse();
    for (const layer of layersToDraw) {
      if (!layer.visible) continue;
      try {
        let drawable = null;
        let w, h;

        if (layer.type === 'video') {
             // 尝试为视频创建截图
             const video = document.createElement('video');
             video.src = layer.url;
             video.crossOrigin = "anonymous";
             await new Promise((resolve) => {
                 video.currentTime = 0;
                 video.onloadeddata = resolve;
                 video.onerror = resolve; // 忽略错误
             });
             drawable = video;
             w = video.videoWidth;
             h = video.videoHeight;
        } else {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = layer.url;
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
            });
            drawable = img;
            w = img.width;
            h = img.height;
        }
        
        if (drawable) {
            ctx.globalAlpha = layer.opacity / 100;
            ctx.globalCompositeOperation = layer.blendMode;
            
            if (layer.id === bgLayer?.id) {
                 ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
            } else {
                 const hRatio = canvas.width / w;
                 const vRatio = canvas.height / h;
                 const ratio = Math.min(hRatio, vRatio);
                 const drawW = w * ratio * (layer.scale || 1);
                 const drawH = h * ratio * (layer.scale || 1);
                 const x = (canvas.width - drawW) / 2 + (layer.x || 0); 
                 const y = (canvas.height - drawH) / 2 + (layer.y || 0);
                 ctx.drawImage(drawable, x, y, drawW, drawH);
            }
        }
      } catch (e) {
        console.warn("Render error", e);
      }
    }
    return canvas.toDataURL('image/png');
  };

  const handleDownload = async () => {
    const dataUrl = await renderCanvasToDataURL();
    const link = document.createElement('a');
    link.download = `ai-art-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleFullscreenPreview = async () => {
      const dataUrl = await renderCanvasToDataURL();
      setPreviewImage({ url: dataUrl, prompt: prompt || "画布预览" });
  };

  const getDisplayDimensions = () => {
    const targetDim = ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0];
    const ratio = targetDim.width / targetDim.height;
    const maxWidth = 800; 
    const maxHeight = 600;
    let w = maxWidth;
    let h = w / ratio;
    if (h > maxHeight) {
       h = maxHeight;
       w = h * ratio;
    }
    return { width: w, height: h };
  };

  const canvasSizeStyle = getDisplayDimensions();
  const targetDim = getTargetDimensions();

  return (
    <div 
      className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden selection:bg-indigo-500/30"
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchMove={handleDragMove}
      onTouchEnd={handleDragEnd}
    >
      
      <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleUploadImage} 
          accept="image/*,video/*" 
          className="hidden" 
      />

      {/* --- Settings Modal --- */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Settings size={20} className="text-indigo-400" />
                API 配置
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy... 或 sk-..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-2">
                  用于图像生成、编辑、背景移除和视频生成功能。支持 Gemini 和 OpenAI 格式的 API Key。
                </p>
              </div>
              
              <button 
                onClick={handleSaveSettings}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg font-medium transition-all mt-4"
              >
                <Save size={18} />
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Left: Layer Panel --- */}
      <div className="w-72 border-r border-slate-800 flex flex-col bg-slate-900/80 backdrop-blur-md z-20">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2 text-slate-100">
            <Layers size={18} className="text-indigo-400"/>
            图层
          </h2>
          <span className="text-xs text-slate-500">{layers.length} 个项目</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {layers.map(layer => (
            <div 
              key={layer.id} 
              onClick={() => setSelectedLayerId(layer.id)}
              className={`group flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border
                ${selectedLayerId === layer.id 
                  ? 'bg-indigo-600/20 border-indigo-500/50 shadow-sm' 
                  : 'bg-slate-800/40 border-transparent hover:bg-slate-800'}
              `}
            >
              <button 
                onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, 'visible', !layer.visible); }}
                className={`p-1 rounded hover:bg-slate-700 ${layer.visible ? 'text-slate-300' : 'text-slate-600'}`}
              >
                {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              
              <div className="w-8 h-8 rounded bg-slate-950 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center relative">
                {layer.type === 'video' ? (
                   <>
                     <video src={layer.url} className="w-full h-full object-cover opacity-60" muted />
                     <PlayCircle size={12} className="absolute text-white/80" />
                   </>
                ) : (
                   <img src={layer.url} className="w-full h-full object-cover" alt="" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate font-medium ${selectedLayerId === layer.id ? 'text-indigo-200' : 'text-slate-300'}`}>
                  {layer.name}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  {layer.blendMode !== 'normal' && <Blend size={10} />}
                  {layer.type === 'video' ? 'Video' : layer.blendMode} · {layer.opacity}%
                </div>
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1.5 hover:bg-slate-900 rounded transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Selected Layer Properties */}
        {selectedLayerId && layers.find(l => l.id === selectedLayerId) && (
          <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-4">
            {/* BG Removal (Compose Mode Only) */}
            {activeMode === 'compose' && layers.find(l => l.id === selectedLayerId).type !== 'background' && layers.find(l => l.id === selectedLayerId).type !== 'video' && (
              <button
                onClick={handleRemoveBackground}
                disabled={isRemovingBg}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-300 py-2 rounded-lg border border-slate-700 hover:border-indigo-500/50 transition-all text-xs font-medium disabled:opacity-50"
              >
                {isRemovingBg ? <Loader2 size={14} className="animate-spin"/> : <Scissors size={14} />}
                {isRemovingBg ? '正在移除背景...' : '移除背景 (透明化)'}
              </button>
            )}

            <div>
               <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                 <span>不透明度</span>
                 <span>{layers.find(l => l.id === selectedLayerId).opacity}%</span>
               </div>
               <input 
                 type="range" min="0" max="100" 
                 value={layers.find(l => l.id === selectedLayerId).opacity}
                 onPointerDown={recordHistory}
                 onChange={(e) => updateLayer(selectedLayerId, 'opacity', parseInt(e.target.value))}
                 className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
               />
            </div>

            <div>
               <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                 <span>缩放</span>
                 <span>{Math.round((layers.find(l => l.id === selectedLayerId).scale || 1) * 100)}%</span>
               </div>
               <div className="flex items-center gap-2">
                  <Maximize2 size={12} className="text-slate-500"/>
                  <input 
                    type="range" min="0.1" max="3" step="0.1"
                    onPointerDown={recordHistory}
                    value={layers.find(l => l.id === selectedLayerId).scale || 1}
                    onChange={(e) => updateLayer(selectedLayerId, 'scale', parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    disabled={layers.find(l => l.id === selectedLayerId).type === 'background'} 
                  />
               </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">混合模式</span>
              <select 
                value={layers.find(l => l.id === selectedLayerId).blendMode}
                onChange={(e) => updateLayer(selectedLayerId, 'blendMode', e.target.value)}
                className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
              >
                {BLEND_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* --- Center: Canvas & Toolbar --- */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
        
        {/* Top Bar */}
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/80 backdrop-blur z-10 shadow-sm">
          <div className="flex bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/50">
            {[
              { id: 'generate', icon: Wand2, label: '生成' },
              { id: 'mask', icon: PenTool, label: '遮罩' }, 
              { id: 'compose', icon: Combine, label: '编辑' }, // 将合成改为编辑
              { id: 'video', icon: VideoIcon, label: '视频' }  // 视频放到最后
            ].map(mode => (
              <button 
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={`flex flex-col items-center px-4 py-1 rounded-lg text-xs font-medium transition-all ${activeMode === mode.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                   <mode.icon size={14} />
                   <span className="text-sm">{mode.label}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 text-slate-500 bg-slate-800/30 rounded-lg p-1 mr-2 border border-slate-800">
                <button 
                  onClick={handleUndo} 
                  disabled={undoStack.length === 0}
                  className={`p-2 rounded ${undoStack.length === 0 ? 'text-slate-700 cursor-not-allowed' : 'hover:bg-slate-700 hover:text-slate-300'}`} 
                  title="撤销"
                >
                  <Undo2 size={18} />
                </button>
                <button 
                  onClick={handleRedo} 
                  disabled={redoStack.length === 0}
                  className={`p-2 rounded ${redoStack.length === 0 ? 'text-slate-700 cursor-not-allowed' : 'hover:bg-slate-700 hover:text-slate-300'}`} 
                  title="重做"
                >
                  <Redo2 size={18} />
                </button>
             </div>
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-2 text-indigo-300 hover:text-white hover:bg-indigo-600/80 rounded-lg transition-all border border-indigo-500/30 hover:border-indigo-500" 
              title="导出为PNG (视频为首帧)"
            >
              <Download size={18} />
              <span className="text-sm font-medium hidden sm:inline">导出</span>
            </button>
             <button 
              onClick={handleFullscreenPreview}
              className="p-2 text-indigo-300 hover:text-white hover:bg-indigo-600/80 rounded-lg transition-all border border-indigo-500/30 hover:border-indigo-500" 
              title="预览"
            >
              <Maximize2 size={18} />
            </button>
            {/* Settings Button */}
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all" 
              title="配置 API Key"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 p-8 flex items-center justify-center overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] relative select-none">
          
          <div 
            ref={canvasRef}
            className="relative bg-slate-900 shadow-2xl shadow-black rounded-sm overflow-hidden border border-slate-800 transition-all duration-300"
            style={canvasSizeStyle}
          >
            {/* 1. Render Layers */}
            {layers.slice().reverse().map((layer) => (
              layer.visible && (
                <div
                  key={layer.id}
                  onMouseDown={(e) => handleDragStart(e, layer.id)}
                  onTouchStart={(e) => handleDragStart(e, layer.id)}
                  onWheel={(e) => handleWheel(e, layer.id)}
                  className={`absolute inset-0 w-full h-full flex items-center justify-center transition-opacity duration-100
                      ${activeMode === 'compose' && layer.type !== 'background' ? 'cursor-move hover:ring-1 hover:ring-white/20' : ''}
                      ${selectedLayerId === layer.id && activeMode === 'compose' && layer.type !== 'background' ? 'ring-2 ring-indigo-500 z-10' : ''}
                  `}
                  style={{ 
                    opacity: layer.opacity / 100,
                    mixBlendMode: layer.blendMode,
                    transform: `translate(${layer.x || 0}px, ${layer.y || 0}px) scale(${layer.scale || 1})`
                  }}
                >
                  {layer.type === 'video' ? (
                      <video
                        src={layer.url}
                        className="max-w-full max-h-full object-contain select-none pointer-events-none"
                        autoPlay
                        loop
                        muted
                        playsInline
                        crossOrigin="anonymous"
                      />
                  ) : (
                      <img
                        src={layer.url}
                        alt={layer.name}
                        className="max-w-full max-h-full object-contain select-none pointer-events-none"
                        draggable={false}
                      />
                  )}
                </div>
              )
            ))}

            {/* 2. Mask Canvas (High Res) */}
            {activeMode === 'mask' && (
              <div className="absolute inset-0 z-20 pointer-events-none">
                 <canvas
                    ref={maskCanvasRef}
                    width={targetDim.width}
                    height={targetDim.height}
                    style={{ width: '100%', height: '100%' }}
                    className="absolute inset-0 w-full h-full touch-none cursor-crosshair pointer-events-auto"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                 />
                 {!isDrawing && !isGenerating && (
                   <div className="absolute top-3 left-3 bg-indigo-600/90 text-white px-3 py-1.5 rounded-md shadow-lg backdrop-blur pointer-events-none flex items-center gap-2 text-xs">
                     <PenTool size={12} />
                     <span>绘制遮罩以编辑</span>
                   </div>
                 )}
              </div>
            )}

            {/* 3. Loading Overlay */}
            {isGenerating && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center text-indigo-400">
                <Loader2 size={48} className="animate-spin mb-4" />
                <span className="text-lg font-medium animate-pulse drop-shadow-lg">
                  {activeMode === 'generate' ? 'AI 正在构想...' : 
                   activeMode === 'video' ? 'AI 正在渲染视频...' : 
                   activeMode === 'compose' ? 'AI 正在编辑...' :
                   activeMode === 'mask' ? 'AI 正在重绘...' : 
                   'AI 正在处理...'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Toolbar */}
        <div className="h-auto bg-slate-900 border-t border-slate-800 p-6 z-20">
          <div className="max-w-4xl mx-auto space-y-3">
            
            {/* Tools */}
            <div className="flex justify-between items-end px-1">
                <div className="flex items-center gap-4">
                  <label className="text-xs text-slate-400 font-medium ml-1 flex items-center gap-2">
                      {activeMode === 'generate' ? "提示词 (Prompt)" : 
                       activeMode === 'video' ? "视频描述 (Video Prompt)" : 
                       activeMode === 'mask' ? "重绘指令 (Inpaint Instruction)" : 
                       "编辑指令 (Edit Instruction)"}
                      {activeMode === 'compose' && <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded">描述如何融合/修改画面</span>}
                  </label>

                  {/* Mask Tools */}
                  {activeMode === 'mask' && (
                    <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
                       <div className="flex items-center gap-1 px-2">
                          <span className="text-[10px] text-slate-400 hidden sm:inline">大小</span>
                          <input 
                            type="range" min="5" max="100" 
                            value={brushSize} onChange={(e) => setBrushSize(e.target.value)}
                            className="w-16 sm:w-20 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                            title={`大小: ${brushSize}px`}
                          />
                       </div>
                       
                       <div className="w-px h-4 bg-slate-700 mx-1"></div>
                       
                       <div className="flex items-center gap-1">
                          {BRUSH_PALETTE.map(color => (
                             <button
                               key={color.id}
                               onClick={() => setActiveBrush(color)}
                               className={`w-4 h-4 rounded-full ${color.className} transition-all ${activeBrush.id === color.id ? 'ring-2 scale-110' : 'opacity-60 hover:opacity-100'}`}
                               title={`颜色: ${color.label}`}
                             />
                          ))}
                       </div>

                       <div className="w-px h-4 bg-slate-700 mx-1"></div>

                       <button 
                         onClick={clearMask}
                         className="text-xs flex items-center gap-1 text-slate-400 hover:text-red-400 px-2 py-0.5 hover:bg-slate-700 rounded transition-colors"
                         title="清除遮罩"
                       >
                         <Eraser size={12} />
                         <span className="hidden sm:inline">清除</span>
                       </button>
                    </div>
                  )}

                  {/* Video Duration Selector */}
                  {activeMode === 'video' && (
                    <div className="relative flex items-center">
                       <Clock size={14} className="absolute left-2 text-slate-500 pointer-events-none"/>
                       <select 
                          value={videoDuration} 
                          onChange={(e) => setVideoDuration(parseInt(e.target.value))}
                          className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 rounded pl-7 pr-8 py-1 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer transition-colors"
                       >
                          {VIDEO_DURATIONS.map(d => (
                             <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                       </select>
                       <ChevronDown size={12} className="absolute right-2 text-slate-500 pointer-events-none"/>
                    </div>
                  )}

                  {/* Aspect Ratio Selector */}
                  {(activeMode === 'generate' || activeMode === 'compose' || activeMode === 'video') && (
                    <div className="relative flex items-center">
                       <LayoutTemplate size={14} className="absolute left-2 text-slate-500 pointer-events-none"/>
                       <select 
                          value={aspectRatio} 
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 rounded pl-7 pr-8 py-1 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer transition-colors"
                       >
                          {(activeMode === 'video' 
                            ? ASPECT_RATIOS.filter(r => r.value === '16:9' || r.value === '9:16') 
                            : ASPECT_RATIOS
                          ).map(ratio => (
                             <option key={ratio.value} value={ratio.value}>{ratio.label}</option>
                          ))}
                       </select>
                       <ChevronDown size={12} className="absolute right-2 text-slate-500 pointer-events-none"/>
                    </div>
                  )}
                </div>
            </div>

            <div className="flex items-stretch gap-3">
              <div className="flex-1 relative group">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    activeMode === 'generate' ? "描述场景，例如：雨夜中的赛博朋克街道..." :
                    activeMode === 'video' ? "描述视频动作，例如：一只猫在草地上奔跑，高清风格..." :
                    activeMode === 'mask' ? "涂抹区域然后描述：例如：在这里添加红玫瑰..." :
                    activeMode === 'compose' ? "例如：将上传的人物自然地融合到背景中，调整光影..." :
                    "在此输入提示词..."
                  }
                  className="w-full h-24 bg-slate-950 border border-slate-700 group-hover:border-slate-600 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-all text-sm leading-relaxed shadow-inner"
                />
              </div>
              
              <div className="flex flex-col gap-2 w-32 shrink-0">
                {activeMode === 'compose' && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border border-slate-700 hover:border-indigo-500/50"
                    title="上传图片作为图层"
                  >
                    <Upload size={20} />
                    <span className="text-xs">上传</span>
                  </button>
                )}

                <button 
                  onClick={handleAction}
                  disabled={(!prompt && activeMode !== 'compose') || isGenerating}
                  className={`
                    flex-1 rounded-xl font-bold text-lg flex flex-col items-center justify-center gap-2 transition-all border border-transparent
                    ${isGenerating 
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                      : 'bg-gradient-to-b from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-lg shadow-indigo-900/50 hover:scale-[1.02] active:scale-95'}
                  `}
                  style={{ height: activeMode === 'compose' ? 'auto' : '100%' }}
                >
                  {isGenerating ? <Loader2 className="animate-spin" /> : 
                   activeMode === 'generate' ? <Wand2 size={24} /> : 
                   activeMode === 'video' ? <VideoIcon size={24} /> : 
                   activeMode === 'mask' ? <ScanLine size={24} /> : <Plus size={24} />}
                  <span className="text-xs font-normal opacity-80">
                    {activeMode === 'generate' ? '生成' : 
                     activeMode === 'video' ? '生成视频' : 
                     activeMode === 'mask' ? '重绘' : '编辑'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Right: History Panel --- */}
      <div className="w-72 border-l border-slate-800 bg-slate-900/80 backdrop-blur-md flex flex-col z-20 pointer-events-auto">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="font-semibold flex items-center gap-2 text-slate-100">
            <History size={18} className="text-indigo-400" />
            历史记录
          </h2>
          <div className="w-2 h-2 rounded-full bg-green-500" title="本地模式"></div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start">
          {history.map((item) => (
            <div 
              key={item.id} 
              className="group relative aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-950 cursor-pointer transition-all"
            >
               {/* 视频在历史记录中显示预览或图标 */}
               {item.type === 'video' ? (
                   <div className="w-full h-full bg-slate-800 flex items-center justify-center relative">
                       {/* 简单使用 video 标签作为缩略图，muted */}
                       <video src={item.url} className="w-full h-full object-cover opacity-80" muted />
                       <PlayCircle className="absolute text-white w-8 h-8 opacity-80" />
                   </div>
               ) : (
                  <img 
                    src={item.thumbnail || item.url} 
                    alt={item.prompt} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                  />
               )}
              
              {/* History Hover Actions */}
              <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                 <button 
                   onClick={() => handleAddToCanvas(item)}
                   className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transform hover:scale-105 transition-all"
                 >
                    <Plus size={14} />
                    添加图层
                 </button>
                 <button 
                   onClick={() => handlePreview(item)}
                   className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transform hover:scale-105 transition-all"
                 >
                    <ZoomIn size={14} />
                    查看
                 </button>
                 <button 
                   onClick={() => handleDeleteHistory(item)}
                   className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transform hover:scale-105 transition-all"
                 >
                    <Trash2 size={14} />
                    删除
                 </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Fullscreen Preview Modal --- */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-8 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
            <button 
              className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50"
              onClick={() => setPreviewImage(null)}
            >
              <X size={24} />
            </button>
            
            <div 
               className="relative overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
               style={{ maxHeight: '85vh', maxWidth: '90vw' }}
               onWheel={handlePreviewWheel}
               onMouseDown={handlePreviewMouseDown}
               onMouseMove={handlePreviewMouseMove}
               onMouseUp={handlePreviewMouseUp}
               onClick={(e) => e.stopPropagation()}
            >
               {previewImage.type === 'video' ? (
                   <video 
                     src={previewImage.url} 
                     controls 
                     autoPlay 
                     loop 
                     className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                     style={{ 
                        transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})`,
                        transition: isPreviewDragging ? 'none' : 'transform 0.1s ease-out'
                     }}
                   />
               ) : (
                   <img 
                     src={previewImage.url} 
                     alt="Preview" 
                     style={{ 
                       transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})`,
                       transition: isPreviewDragging ? 'none' : 'transform 0.1s ease-out'
                     }}
                     className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-none"
                   />
               )}
            </div>
            
            <div className="absolute bottom-8 flex gap-2 items-center bg-black/60 backdrop-blur px-4 py-2 rounded-full pointer-events-auto z-50">
                <button onClick={(e) => { e.stopPropagation(); handlePreviewZoom(-0.5); }} className="p-1 hover:bg-white/20 rounded"><ZoomOut size={16}/></button>
                <span className="text-xs font-mono w-12 text-center">{Math.round(previewScale * 100)}%</span>
                <button onClick={(e) => { e.stopPropagation(); handlePreviewZoom(0.5); }} className="p-1 hover:bg-white/20 rounded"><ZoomIn size={16}/></button>
                <div className="w-px h-4 bg-white/20 mx-2"></div>
                <button onClick={(e) => { e.stopPropagation(); setPreviewScale(1); setPreviewOffset({x:0,y:0}); }} className="p-1 hover:bg-white/20 rounded"><RotateCcw size={16}/></button>
            </div>

        </div>
      )}

    </div>
  );
}
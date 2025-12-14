import React, { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

// Cube Coordinates System for Hexagonal Grid
// Each hex has coordinates (q, r, s) where q + r + s = 0
const cubeToPixel = (q, r, size) => {
  const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
  const y = size * (3 / 2 * r);
  return { x, y };
};

const Hexagon = ({ x, y, size, fill, stroke }) => {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    points.push(`${px},${py}`);
  }
  return (
    <polygon
      points={points.join(' ')}
      fill={fill}
      stroke={stroke}
      strokeWidth="0.5"
    />
  );
};

export default function HoneycombPixelArt() {
  const [image, setImage] = useState(null);
  const [fileName, setFileName] = useState('honeycomb-pixelart');
  const [hexSize, setHexSize] = useState(12);
  const [hexagons, setHexagons] = useState([]);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [svgDimensions, setSvgDimensions] = useState({ width: 600, height: 400 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStroke, setShowStroke] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const dragCounterRef = useRef(0);

  const getPixelColor = useCallback((imageData, x, y, width, height) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return null;
    }
    const px = Math.floor(x);
    const py = Math.floor(y);
    const index = (py * width + px) * 4;
    return {
      r: imageData.data[index],
      g: imageData.data[index + 1],
      b: imageData.data[index + 2],
      a: imageData.data[index + 3]
    };
  }, []);

  const getAverageColor = useCallback((imageData, centerX, centerY, radius, width, height) => {
    let totalR = 0, totalG = 0, totalB = 0, count = 0;

    // Sample pixels within the hexagon area
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const sampleX = centerX + dx;
        const sampleY = centerY + dy;

        // Only sample if within image bounds
        if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
          const color = getPixelColor(imageData, sampleX, sampleY, width, height);
          if (color && color.a > 0) {
            totalR += color.r;
            totalG += color.g;
            totalB += color.b;
            count++;
          }
        }
      }
    }

    if (count === 0) return null;

    return `rgb(${Math.round(totalR / count)}, ${Math.round(totalG / count)}, ${Math.round(totalB / count)})`;
  }, [getPixelColor]);

  const processImage = useCallback((img) => {
    setIsProcessing(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const maxWidth = 800;
    const maxHeight = 600;
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
      height = (maxWidth / width) * height;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (maxHeight / height) * width;
      height = maxHeight;
    }

    width = Math.floor(width);
    height = Math.floor(height);

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);

    // Hexagon dimensions
    const hexWidth = Math.sqrt(3) * hexSize;
    const hexHeight = hexSize * 2;
    const vertDist = hexHeight * 0.75;
    const horizDist = hexWidth;

    // Calculate grid size to cover entire image with extra padding
    const padding = 3; // Extra hexagons on each side
    const cols = Math.ceil(width / horizDist) + padding * 2;
    const rows = Math.ceil(height / vertDist) + padding * 2;

    const newHexagons = [];

    // Track min/max for SVG viewBox
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (let row = -padding; row < rows; row++) {
      for (let col = -padding; col < cols; col++) {
        // Offset odd rows for proper hexagonal tiling
        const xOffset = (row % 2 === 0) ? 0 : hexWidth / 2;

        // Calculate center position of this hexagon
        const hexCenterX = col * horizDist + xOffset + hexSize;
        const hexCenterY = row * vertDist + hexSize;

        // Check if this hexagon overlaps with the image
        const imgX = hexCenterX;
        const imgY = hexCenterY;

        // Only create hexagon if its center is reasonably close to the image
        if (imgX >= -hexSize && imgX < width + hexSize &&
            imgY >= -hexSize && imgY < height + hexSize) {

          // Clamp sampling coordinates to image bounds
          const sampleX = Math.max(0, Math.min(width - 1, imgX));
          const sampleY = Math.max(0, Math.min(height - 1, imgY));

          const color = getAverageColor(imageData, sampleX, sampleY, Math.floor(hexSize * 0.7), width, height);

          if (color) {
            newHexagons.push({
              col, row,
              x: hexCenterX,
              y: hexCenterY,
              color
            });

            // Track bounds for SVG
            minX = Math.min(minX, hexCenterX - hexSize);
            minY = Math.min(minY, hexCenterY - hexSize);
            maxX = Math.max(maxX, hexCenterX + hexSize);
            maxY = Math.max(maxY, hexCenterY + hexSize);
          }
        }
      }
    }

    // SVGの幅と高さを計算する
    const svgPadding = hexSize;
    const svgWidth = Math.ceil(maxX - minX + svgPadding * 2);
    const svgHeight = Math.ceil(maxY - minY + svgPadding * 2);

    // 六角形の位置を調整する
    const offsetX = -minX + svgPadding;
    const offsetY = -minY + svgPadding;

    // 六角形の位置を調整した新しい配列を作成
    const adjustedHexagons = newHexagons.map(hex => ({
      ...hex,
      x: hex.x + offsetX,
      y: hex.y + offsetY
    }));

    setHexagons(adjustedHexagons);
    setDimensions({ width, height });
    setSvgDimensions({ width: svgWidth, height: svgHeight });
    setIsProcessing(false);
  }, [hexSize, getAverageColor]);

  // ファイル名から拡張子を除去するヘルパー関数
  const getBaseFileName = (fullFileName) => {
    const lastDotIndex = fullFileName.lastIndexOf('.');
    if (lastDotIndex === -1) return fullFileName;
    return fullFileName.substring(0, lastDotIndex);
  };

  // 共通の画像処理関数
  const processFile = useCallback((file) => {
    if (file && file.type.startsWith('image/')) {
      // ファイル名を保存（拡張子を除去）
      const baseName = getBaseFileName(file.name);
      setFileName(baseName);

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
          processImage(img);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  }, [processImage]);

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  // ドラッグ&ドロップ イベントハンドラー
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      processFile(file);
    }
  }, [processFile]);

  useEffect(() => {
    if (image) {
      processImage(image);
    }
  }, [hexSize, image, processImage]);

  const downloadSVG = useCallback(() => {
    const svgElement = document.getElementById('honeycomb-svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}-honeycomb.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileName]);

  const downloadImage = useCallback((format) => {
    const svgElement = document.getElementById('honeycomb-svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 高解像度のために2倍のスケールを使用
      const scale = 2;
      canvas.width = svgDimensions.width * scale;
      canvas.height = svgDimensions.height * scale;

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // JPEGの場合のみ背景色を設定
      if (format === 'jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, svgDimensions.width, svgDimensions.height);
      }
      // PNGの場合は背景を描画しない（透明になる）

      ctx.drawImage(img, 0, 0, svgDimensions.width, svgDimensions.height);

      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = format === 'jpeg' ? 0.95 : undefined;

      canvas.toBlob((blob) => {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${fileName}_honeycomb.${format}`;
        a.click();
        URL.revokeObjectURL(downloadUrl);
      }, mimeType, quality);

      URL.revokeObjectURL(url);
    };

    img.src = url;
  }, [svgDimensions, fileName]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        fontFamily: '"Outfit", system-ui, sans-serif',
        color: '#e8e8e8',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet" />

      {/* Drag Overlay */}
      {isDragging && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(245, 158, 11, 0.1)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          border: '4px dashed #f59e0b',
          margin: '16px',
          borderRadius: '24px'
        }}>
          <div style={{
            textAlign: 'center',
            color: '#f59e0b'
          }}>
            <svg width="80" height="80" viewBox="0 0 48 48" style={{ marginBottom: '16px' }}>
              <polygon
                points="24,4 42,14 42,34 24,44 6,34 6,14"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
              />
              <path
                d="M24 16v12M18 22l6-6 6 6"
                stroke="#f59e0b"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 8px' }}>
              Drop your image here
            </p>
            <p style={{ fontSize: '1rem', margin: 0, opacity: 0.8 }}>
              Release to transform into hexagonal art
            </p>
          </div>
        </div>
      )}

      {/* Background Pattern */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='70' viewBox='0 0 60 70' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23ffffff' stroke-opacity='0.03' stroke-width='1'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 70px',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <svg width="48" height="48" viewBox="0 0 48 48">
              <defs>
                <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <polygon
                points="24,4 42,14 42,34 24,44 6,34 6,14"
                fill="url(#hexGrad)"
              />
              <polygon
                points="24,12 33,17.5 33,28.5 24,34 15,28.5 15,17.5"
                fill="#1a1a2e"
              />
            </svg>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              margin: 0,
              background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em'
            }}>
              Honeycomb Pixel Art
            </h1>
          </div>
          <p style={{
            color: '#94a3b8',
            fontSize: '1rem',
            margin: 0,
            fontWeight: 300,
            fontFamily: 'sans-serif, "Outfit", system-ui'
          }}>
            画像ファイルをハニカムピクセルに変換するサービスです。
          </p>
        </header>

        {/* Controls */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '24px',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Upload Button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '14px 28px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 25px rgba(245, 158, 11, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 20px rgba(245, 158, 11, 0.3)';
              }}
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Upload Image
            </button>
          </div>

          {/* Hex Size Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.875rem', color: '#94a3b8', fontWeight: 500 }}>
                Hex Size
              </label>
              <span style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                padding: '2px 10px',
                borderRadius: '20px',
                fontSize: '0.875rem',
                fontWeight: 600
              }}>
                {hexSize}px
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              value={hexSize}
              onChange={(e) => setHexSize(Number(e.target.value))}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                appearance: 'none',
                background: 'rgba(255,255,255,0.1)',
                cursor: 'pointer',
                accentColor: '#f59e0b'
              }}
            />
          </div>

          {/* Show Stroke Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            userSelect: 'none'
          }}>
            <div style={{
              width: '48px',
              height: '26px',
              background: showStroke ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' : 'rgba(255,255,255,0.1)',
              borderRadius: '13px',
              position: 'relative',
              transition: 'background 0.3s'
            }}>
              <div style={{
                width: '22px',
                height: '22px',
                background: '#fff',
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: showStroke ? '24px' : '2px',
                transition: 'left 0.3s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }} />
            </div>
            <input
              type="checkbox"
              checked={showStroke}
              onChange={(e) => setShowStroke(e.target.checked)}
              style={{ display: 'none' }}
            />
            <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Show Borders</span>
          </label>

          {/* Download Select */}
          {hexagons.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <select
                defaultValue=""
                onChange={(e) => {
                  const format = e.target.value;
                  if (format === 'svg') {
                    downloadSVG();
                  } else if (format) {
                    downloadImage(format);
                  }
                  e.target.value = '';
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#e8e8e8',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '12px',
                  padding: '14px 20px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%23e8e8e8' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '40px',
                  minWidth: '180px'
                }}
              >
                <option value="" disabled style={{ background: '#1e293b', color: '#94a3b8' }}>
                  Download
                </option>
                <option value="svg" style={{ background: '#1e293b', color: '#e8e8e8' }}>
                  SVG
                </option>
                <option value="png" style={{ background: '#1e293b', color: '#e8e8e8' }}>
                  PNG
                </option>
                <option value="jpeg" style={{ background: '#1e293b', color: '#e8e8e8' }}>
                  JPEG
                </option>
              </select>
            </div>
          )}
        </div>

        {/* Canvas Preview Area */}
        <div
          ref={dropZoneRef}
          style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '450px',
            position: 'relative',
            overflow: 'auto'
          }}
        >
          {/* Hidden canvas for image processing */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {isProcessing && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10
            }}>
              <div style={{
                width: '60px',
                height: '60px',
                border: '4px solid rgba(245, 158, 11, 0.3)',
                borderTopColor: '#f59e0b',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {hexagons.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: '#64748b'
            }}>
              <svg width="80" height="80" viewBox="0 0 48 48" style={{ opacity: 0.5, marginBottom: '16px' }}>
                <polygon
                  points="24,4 42,14 42,34 24,44 6,34 6,14"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                />
              </svg>
              <p style={{ fontSize: '1.125rem', margin: '0 0 8px' }}>No image loaded</p>
              <p style={{ fontSize: '0.875rem', margin: 0 }}>
                Upload an image or <strong style={{ color: '#f59e0b' }}>drag & drop</strong> to transform it into hexagonal art
              </p>
            </div>
          ) : (
            <svg
              id="honeycomb-svg"
              width={svgDimensions.width}
              height={svgDimensions.height}
              viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
              style={{
                maxWidth: '100%',
                height: 'auto',
                display: 'block'
              }}
            >
              {/* 背景なし */}
              {hexagons.map((hex, index) => (
                <Hexagon
                  key={`${hex.col}-${hex.row}-${index}`}
                  x={hex.x}
                  y={hex.y}
                  size={hexSize}
                  fill={hex.color}
                  stroke={showStroke ? 'rgba(0,0,0,0.15)' : 'none'}
                />
              ))}
            </svg>
          )}
        </div>

        {/* Info Section */}
        {hexagons.length > 0 && (
          <div style={{
            marginTop: '24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px'
          }}>
            {[
              { label: 'Total Hexagons', value: hexagons.length.toLocaleString() },
              { label: 'Hex Size', value: `${hexSize}px` },
              { label: 'Original Size', value: `${dimensions.width} × ${dimensions.height}` },
              { label: 'Output Size', value: `${svgDimensions.width} × ${svgDimensions.height}` }
            ].map((stat, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'center',
                border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                  {stat.label}
                </div>
                <div style={{ color: '#f59e0b', fontSize: '1.25rem', fontWeight: 600 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
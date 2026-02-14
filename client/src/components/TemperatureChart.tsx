import React, { useRef, useEffect } from 'react';

interface TemperatureChartData {
  timestamp: Date;
  temperature: number;
  alertLevel: 'normal' | 'warning' | 'critical' | 'emergency';
}

interface TemperatureChartProps {
  data: Record<string, TemperatureChartData[]>;
  selectedMotors?: string[];
  width?: number;
  height?: number;
}

const TemperatureChart: React.FC<TemperatureChartProps> = ({ 
  data, 
  selectedMotors = [], 
  width = 800, 
  height = 400 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Motor colors for chart lines
  const motorColors = {
    '1': '#FF6B6B', // Red
    '2': '#4ECDC4', // Teal
    '3': '#45B7D1', // Blue
    '4': '#96CEB4', // Green
    '5': '#FFEAA7', // Yellow
    '6': '#DDA0DD', // Plum
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawChart(ctx, canvas.width, canvas.height);
  }, [data, selectedMotors]);

  const drawChart = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Chart margins
    const margin = { top: 20, right: 80, bottom: 60, left: 60 };
    const chartWidth = canvasWidth - margin.left - margin.right;
    const chartHeight = canvasHeight - margin.top - margin.bottom;

    // Get all data points for scale calculation
    const allTemps: number[] = [];
    const allTimes: Date[] = [];

    selectedMotors.forEach(motorId => {
      const motorData = data[motorId] || [];
      motorData.forEach(point => {
        allTemps.push(point.temperature);
        allTimes.push(point.timestamp);
      });
    });

    if (allTemps.length === 0) {
      // Draw "No Data" message
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No temperature data available', canvasWidth / 2, canvasHeight / 2);
      return;
    }

    // Calculate scales
    const minTemp = Math.min(...allTemps) - 5;
    const maxTemp = Math.max(...allTemps) + 5;
    const minTime = Math.min(...allTimes.map(t => t.getTime()));
    const maxTime = Math.max(...allTimes.map(t => t.getTime()));
    const timeRange = maxTime - minTime || 1;

    // Draw background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(margin.left, margin.top, chartWidth, chartHeight);

    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    // Horizontal grid lines (temperature)
    const tempSteps = 5;
    for (let i = 0; i <= tempSteps; i++) {
      const temp = minTemp + (maxTemp - minTemp) * (i / tempSteps);
      const y = margin.top + chartHeight - (temp - minTemp) / (maxTemp - minTemp) * chartHeight;
      
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + chartWidth, y);
      ctx.stroke();

      // Temperature labels
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`${temp.toFixed(0)}°C`, margin.left - 5, y + 4);
    }

    // Vertical grid lines (time)
    const timeSteps = 6;
    for (let i = 0; i <= timeSteps; i++) {
      const time = minTime + timeRange * (i / timeSteps);
      const x = margin.left + (time - minTime) / timeRange * chartWidth;
      
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + chartHeight);
      ctx.stroke();

      // Time labels
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      const timeStr = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillText(timeStr, x, margin.top + chartHeight + 20);
    }

    // Draw temperature threshold lines
    const thresholds = {
      warning: 60,
      critical: 75,
      emergency: 85
    };

    Object.entries(thresholds).forEach(([level, temp]) => {
      if (temp >= minTemp && temp <= maxTemp) {
        const y = margin.top + chartHeight - (temp - minTemp) / (maxTemp - minTemp) * chartHeight;
        
        ctx.strokeStyle = level === 'warning' ? '#f39c12' : level === 'critical' ? '#e74c3c' : '#8e44ad';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + chartWidth, y);
        ctx.stroke();
        
        // Threshold label
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${level.charAt(0).toUpperCase() + level.slice(1)}: ${temp}°C`, margin.left + chartWidth + 5, y + 4);
      }
    });

    // Reset line dash
    ctx.setLineDash([]);

    // Draw temperature lines for each motor
    selectedMotors.forEach(motorId => {
      const motorData = data[motorId] || [];
      if (motorData.length === 0) return;

      const color = motorColors[motorId as keyof typeof motorColors] || '#333';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      ctx.beginPath();
      let firstPoint = true;

      motorData.forEach(point => {
        const x = margin.left + (point.timestamp.getTime() - minTime) / timeRange * chartWidth;
        const y = margin.top + chartHeight - (point.temperature - minTemp) / (maxTemp - minTemp) * chartHeight;

        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw data points
      ctx.fillStyle = color;
      motorData.forEach(point => {
        const x = margin.left + (point.timestamp.getTime() - minTime) / timeRange * chartWidth;
        const y = margin.top + chartHeight - (point.temperature - minTemp) / (maxTemp - minTemp) * chartHeight;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();

        // Highlight alert points
        if (point.alertLevel !== 'normal') {
          ctx.strokeStyle = point.alertLevel === 'emergency' ? '#8e44ad' : 
                           point.alertLevel === 'critical' ? '#e74c3c' : '#f39c12';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.stroke();
        }
      });
    });

    // Draw legend
    const legendX = margin.left + chartWidth + 10;
    let legendY = margin.top + 20;

    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Motors:', legendX, legendY);
    legendY += 25;

    selectedMotors.forEach(motorId => {
      const color = motorColors[motorId as keyof typeof motorColors] || '#333';
      
      // Color square
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY - 8, 12, 12);
      
      // Motor label
      ctx.fillStyle = '#333';
      ctx.font = '12px Arial';
      ctx.fillText(`Motor ${motorId}`, legendX + 18, legendY + 2);
      
      legendY += 20;
    });

    // Chart title
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Temperature Trend', canvasWidth / 2, 18);

    // Y-axis label
    ctx.save();
    ctx.translate(15, canvasHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Temperature (°C)', 0, 0);
    ctx.restore();

    // X-axis label
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Time', canvasWidth / 2, canvasHeight - 5);
  };

  return (
    <div className="temperature-chart bg-white p-4 rounded-lg shadow-md">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-auto border rounded"
        style={{ maxWidth: '100%' }}
      />
      
      <div className="mt-4 text-sm text-gray-600">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-yellow-500 mr-2"></div>
            <span>Warning Threshold</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-red-500 mr-2"></div>
            <span>Critical Threshold</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-purple-600 mr-2"></div>
            <span>Emergency Threshold</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemperatureChart;
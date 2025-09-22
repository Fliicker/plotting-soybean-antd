import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import * as turf from '@turf/turf';

/**
 * 要素属性类型，参考ArcGIS SHP文件结构
 */
export type FeatureAttributes = {
  id: string;
  name: string;
  geometry_type: string;
  created_time: string;
  // 点要素属性
  x?: number;
  y?: number;
  // 线要素属性
  length?: number;
  length_unit?: string;
  // 面要素属性
  area?: number;
  area_unit?: string;
  perimeter?: number;
  perimeter_unit?: string;
  // 通用属性
  vertex_count?: number;
  // 逐部件展示相关
  parent_id?: string;
  part_index?: number;
  part_count?: number;
} & Record<string, any>;

/**
 * 计算要素的几何属性，类似ArcGIS的字段计算
 */
export function calculateFeatureAttributes(
  feature: Feature<Geometry, GeoJsonProperties>,
  name: string
): FeatureAttributes {
  const id = generateFeatureId();
  const geometryType = feature.geometry.type;
  const createdTime = new Date().toISOString();
  
  const attributes: FeatureAttributes = {
    id,
    name,
    geometry_type: geometryType,
    created_time: createdTime,
  };

  switch (geometryType) {
    case 'Point':
      calculatePointAttributes(feature, attributes);
      break;
    case 'LineString':
      calculateLineAttributes(feature, attributes);
      break;
    case 'Polygon':
      calculatePolygonAttributes(feature, attributes);
      break;
    case 'MultiPoint':
      calculateMultiPointAttributes(feature, attributes);
      break;
    case 'MultiLineString':
      calculateMultiLineAttributes(feature, attributes);
      break;
    case 'MultiPolygon':
      calculateMultiPolygonAttributes(feature, attributes);
      break;
  }

  return attributes;
}

/**
 * 计算点要素属性
 */
function calculatePointAttributes(
  feature: Feature<Geometry, GeoJsonProperties>,
  attributes: FeatureAttributes
): void {
  const coordinates = (feature.geometry as any).coordinates;
  attributes.x = Number(coordinates[0].toFixed(6));
  attributes.y = Number(coordinates[1].toFixed(6));
  attributes.vertex_count = 1;
}

/**
 * 计算线要素属性
 */
function calculateLineAttributes(
  feature: Feature<Geometry, GeoJsonProperties>,
  attributes: FeatureAttributes
): void {
  try {
    // 使用Turf.js计算长度
    const lengthKm = turf.length(feature as any, { units: 'kilometers' });
    const lengthM = lengthKm * 1000;
    
    attributes.length = Number(lengthM.toFixed(2));
    attributes.length_unit = 'meters';
    
    const coordinates = (feature.geometry as any).coordinates;
    attributes.vertex_count = coordinates.length;
  } catch (error) {
    console.warn('计算线要素长度失败:', error);
    attributes.length = 0;
    attributes.length_unit = 'meters';
  }
}

/**
 * 计算面要素属性
 */
function calculatePolygonAttributes(
  feature: Feature<Geometry, GeoJsonProperties>,
  attributes: FeatureAttributes
): void {
  try {
    // 使用Turf.js计算面积和周长
    const areaKm2 = turf.area(feature as any) / 1000000; // 转换为平方公里
    const areaSqM = areaKm2 * 1000000; // 平方米
    
    attributes.area = Number(areaSqM.toFixed(2));
    attributes.area_unit = 'square_meters';
    
    // 计算周长
    const perimeterKm = turf.length(turf.polygonToLine(feature as any), { units: 'kilometers' });
    const perimeterM = perimeterKm * 1000;
    
    attributes.perimeter = Number(perimeterM.toFixed(2));
    attributes.perimeter_unit = 'meters';
    
    const coordinates = (feature.geometry as any).coordinates[0];
    attributes.vertex_count = coordinates.length - 1; // 减去闭合点
  } catch (error) {
    console.warn('计算面要素属性失败:', error);
    attributes.area = 0;
    attributes.area_unit = 'square_meters';
    attributes.perimeter = 0;
    attributes.perimeter_unit = 'meters';
  }
}

/**
 * 计算多点要素属性
 */
function calculateMultiPointAttributes(
  feature: Feature<Geometry, GeoJsonProperties>,
  attributes: FeatureAttributes
): void {
  const coordinates = (feature.geometry as any).coordinates;
  attributes.vertex_count = coordinates.length;
  
  // 计算中心点
  try {
    const center = turf.center(feature as any);
    const centerCoords = center.geometry.coordinates;
    attributes.x = Number(centerCoords[0].toFixed(6));
    attributes.y = Number(centerCoords[1].toFixed(6));
  } catch (error) {
    console.warn('计算多点中心失败:', error);
  }
}

/**
 * 计算多线要素属性
 */
function calculateMultiLineAttributes(
  feature: Feature<Geometry, GeoJsonProperties>,
  attributes: FeatureAttributes
): void {
  try {
    const lengthKm = turf.length(feature as any, { units: 'kilometers' });
    const lengthM = lengthKm * 1000;
    
    attributes.length = Number(lengthM.toFixed(2));
    attributes.length_unit = 'meters';
    
    const coordinates = (feature.geometry as any).coordinates;
    attributes.vertex_count = coordinates.reduce((total: number, line: any[]) => total + line.length, 0);
  } catch (error) {
    console.warn('计算多线要素属性失败:', error);
    attributes.length = 0;
    attributes.length_unit = 'meters';
  }
}

/**
 * 计算多面要素属性
 */
function calculateMultiPolygonAttributes(
  feature: Feature<Geometry, GeoJsonProperties>,
  attributes: FeatureAttributes
): void {
  try {
    const areaKm2 = turf.area(feature as any) / 1000000;
    const areaSqM = areaKm2 * 1000000;
    
    attributes.area = Number(areaSqM.toFixed(2));
    attributes.area_unit = 'square_meters';
    
    // 计算总周长
    const perimeterKm = turf.length(turf.polygonToLine(feature as any), { units: 'kilometers' });
    const perimeterM = perimeterKm * 1000;
    
    attributes.perimeter = Number(perimeterM.toFixed(2));
    attributes.perimeter_unit = 'meters';
    
    const coordinates = (feature.geometry as any).coordinates;
    attributes.vertex_count = coordinates.reduce((total: number, polygon: any[][]) => 
      total + polygon[0].length - 1, 0); // 减去闭合点
  } catch (error) {
    console.warn('计算多面要素属性失败:', error);
    attributes.area = 0;
    attributes.area_unit = 'square_meters';
    attributes.perimeter = 0;
    attributes.perimeter_unit = 'meters';
  }
}

/**
 * 生成唯一的要素ID
 */
function generateFeatureId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `feature_${timestamp}_${random}`;
}

/**
 * 格式化属性值用于显示
 */
export function formatAttributeValue(key: string, value: any): string {
  if (value === null || value === undefined) {
    return '-';
  }

  switch (key) {
    case 'length':
    case 'perimeter':
      return `${value} 米`;
    case 'area':
      return `${value} 平方米`;
    case 'x':
    case 'y':
      return value.toFixed(6);
    case 'created_time':
      return new Date(value).toLocaleString();
    default:
      return String(value);
  }
}

/**
 * 获取属性字段的中文名称
 */
export function getAttributeDisplayName(key: string): string {
  const nameMap: Record<string, string> = {
    id: 'ID',
    name: '名称',
    geometry_type: '几何类型',
    created_time: '创建时间',
    x: 'X坐标',
    y: 'Y坐标',
    length: '长度',
    length_unit: '长度单位',
    area: '面积',
    area_unit: '面积单位',
    perimeter: '周长',
    perimeter_unit: '周长单位',
    vertex_count: '顶点数',
  };

  return nameMap[key] || key;
}

/**
 * 创建要素的GeoJSON对象，包含计算的属性
 */
export function createFeatureWithAttributes(
  originalFeature: Feature<Geometry, GeoJsonProperties>,
  name: string
): Feature<Geometry, FeatureAttributes> {
  const attributes = calculateFeatureAttributes(originalFeature, name);
  
  return {
    type: 'Feature',
    geometry: originalFeature.geometry,
    properties: attributes,
  };
}

/**
 * 将 Multi* 要素拆分为按部件的单要素，并计算属性。
 * 非 Multi* 要素将直接返回单元素数组。
 */
export function explodeFeatureToPartFeatures(
  originalFeature: Feature<Geometry, GeoJsonProperties>,
  baseName: string
): Array<Feature<Geometry, FeatureAttributes>> {
  const type = originalFeature.geometry.type;
  const parentId = generateFeatureId();

  if (type === 'MultiPoint') {
    const coords = (originalFeature.geometry as any).coordinates as number[][];
    return coords.map((c, i) => {
      const f = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: {}
      } as Feature<Geometry, GeoJsonProperties>;
      const withAttr = createFeatureWithAttributes(f, `${baseName}_${i + 1}`);
      withAttr.properties.parent_id = parentId;
      withAttr.properties.part_index = i + 1;
      withAttr.properties.part_count = coords.length;
      return withAttr;
    });
  }

  if (type === 'MultiLineString') {
    const lines = (originalFeature.geometry as any).coordinates as number[][][];
    return lines.map((line, i) => {
      const f = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: line },
        properties: {}
      } as Feature<Geometry, GeoJsonProperties>;
      const withAttr = createFeatureWithAttributes(f, `${baseName}_${i + 1}`);
      withAttr.properties.parent_id = parentId;
      withAttr.properties.part_index = i + 1;
      withAttr.properties.part_count = lines.length;
      return withAttr;
    });
  }

  if (type === 'MultiPolygon') {
    const polys = (originalFeature.geometry as any).coordinates as number[][][][];
    return polys.map((poly, i) => {
      const f = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: poly },
        properties: {}
      } as Feature<Geometry, GeoJsonProperties>;
      const withAttr = createFeatureWithAttributes(f, `${baseName}_${i + 1}`);
      withAttr.properties.parent_id = parentId;
      withAttr.properties.part_index = i + 1;
      withAttr.properties.part_count = polys.length;
      return withAttr;
    });
  }

  // 非 Multi*：保持原样，仍按单要素计算
  return [createFeatureWithAttributes(originalFeature, baseName)];
}

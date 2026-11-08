import path from 'path';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const ALLOWED_LOGO_MIME_TYPES = [
  'image/svg+xml',
  'image/png',
  'image/webp',
  'image/jpeg',
  'image/jpg',
] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
] as const;

export const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.pdf',
] as const;

export const ALLOWED_LOGO_EXTENSIONS = [
  '.svg',
  '.png',
  '.webp',
  '.jpg',
  '.jpeg',
] as const;

const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.php', '.pl', '.py', '.rb',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.html', '.htm',
  '.asp', '.aspx', '.jsp', '.dll', '.so', '.bin', '.scr', '.vbs',
];

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_SVG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export interface FileValidationOptions {
  allowSvg?: boolean;
  category?: string;
  entityType?: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
  detectedType?: 'IMAGE' | 'DOCUMENT' | 'SVG_LOGO';
}

export interface SvgValidationResult {
  valid: boolean;
  error?: string;
  sanitizedBuffer?: Buffer;
  cleanSvg?: string;
  width?: number;
  height?: number;
  viewBox?: string;
}

/**
 * Determines whether the target upload context is a logo or brand identity asset
 * eligible for SVG vector logo uploads.
 */
export function isLogoOrIdentityContext(category?: string, entityType?: string): boolean {
  const cat = (category || '').toUpperCase().trim();
  const ent = (entityType || '').toUpperCase().trim();
  if (cat === 'LOGO' || cat === 'BRAND' || cat === 'PARTNER_LOGO' || cat === 'BUILDER_LOGO' || cat === 'DEVELOPER_LOGO') {
    return true;
  }
  if (ent === 'DEVELOPER' && (cat === '' || cat === 'LOGO' || cat === 'BRAND' || cat === 'OFFICE' || cat === 'EDITORIAL')) {
    return true;
  }
  return false;
}

/**
 * Sanitizes a filename to prevent directory traversal, null-byte injection, and unsafe characters.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Strip null bytes and path traversal sequences
  const clean = filename.replace(/\0/g, '').replace(/(\.\.(\/|\\|$))+/g, '');
  const base = path.basename(clean);

  // Replace non-alphanumeric (except . - _) with underscores
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');

  // Prevent leading dots (.htaccess, .env)
  const trimmed = safe.replace(/^\.+/, '');

  return trimmed || 'unnamed_file';
}

/**
 * Validates binary magic bytes of an uploaded buffer against its declared MIME type.
 */
export function validateBinarySignature(
  buffer: Buffer,
  mimeType: string
): { valid: boolean; error?: string } {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: 'File buffer is empty or too short to contain a valid header.' };
  }

  const normalizedMime = (mimeType || '').toLowerCase().trim();

  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid JPEG binary signature (magic bytes mismatch).' };
  }

  if (normalizedMime === 'image/png') {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid PNG binary signature (magic bytes mismatch).' };
  }

  if (normalizedMime === 'image/webp') {
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid WebP binary signature (magic bytes mismatch).' };
  }

  if (normalizedMime === 'image/avif') {
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
      const brand = buffer.toString('ascii', 8, 12);
      if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'msf1') {
        return { valid: true };
      }
    }
    return { valid: false, error: 'Invalid AVIF binary signature (magic bytes mismatch).' };
  }

  if (normalizedMime === 'application/pdf') {
    if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid PDF binary signature (missing %PDF- header).' };
  }

  if (normalizedMime === 'image/svg+xml') {
    const svgCheck = validateAndSanitizeSvgBuffer(buffer);
    if (!svgCheck.valid) {
      return { valid: false, error: svgCheck.error || 'Invalid SVG structure.' };
    }
    return { valid: true };
  }

  return { valid: false, error: `Unsupported MIME type '${mimeType}' for binary signature check.` };
}

/**
 * Validates that a Buffer is a valid PDF document (%PDF- header and non-empty).
 */
export function validatePdfContent(buffer: Buffer): { valid: boolean; error?: string } {
  if (!buffer || buffer.length < 5) {
    return { valid: false, error: 'PDF buffer is empty or too short.' };
  }
  if (buffer.toString('ascii', 0, 5) !== '%PDF-') {
    return { valid: false, error: 'Invalid PDF binary signature (missing %PDF- header).' };
  }
  return { valid: true };
}

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// SVG Element Tag Allowlist for logos and vector brand identity
const ALLOWED_SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textpath', 'defs', 'lineargradient', 'radialgradient', 'stop',
  'pattern', 'clippath', 'mask', 'use', 'desc', 'title', 'filter', 'fecolormatrix', 'image'
]);

// SVG Attribute Allowlist for elements
const ALLOWED_SVG_ATTRS = new Set([
  'xmlns', 'xmlns:xlink', 'version', 'viewbox', 'width', 'height', 'id', 'class',
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-opacity', 'opacity', 'transform', 'transform-origin', 'clip-path', 'clip-rule',
  'mask', 'filter', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform',
  'patternunits', 'patterntransform', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-anchor', 'letter-spacing', 'word-spacing', 'dx', 'dy',
  'startoffset', 'href', 'xlink:href', 'preserveaspectratio', 'zoomandpan', 'values',
  'color-interpolation-filters'
]);

/**
 * Strictly validates and sanitizes an SVG buffer for developer/builder/brand logo uploads
 * using DOMParser XML AST traversal and strict element/attribute allowlists.
 */
export function validateAndSanitizeSvgBuffer(buffer: Buffer): SvgValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'SVG file buffer is empty.' };
  }

  if (buffer.length > MAX_SVG_SIZE_BYTES) {
    return {
      valid: false,
      error: `SVG file size (${buffer.length} bytes) exceeds maximum limit of ${MAX_SVG_SIZE_BYTES} bytes.`,
    };
  }

  // Reject binary raster files masquerading as SVG
  if (
    (buffer[0] === 0xff && buffer[1] === 0xd8) ||
    (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
  ) {
    return { valid: false, error: 'Binary raster image cannot be uploaded as image/svg+xml.' };
  }

  let rawString = buffer.toString('utf8');
  // Strip UTF-8 BOM if present
  if (rawString.charCodeAt(0) === 0xfeff) {
    rawString = rawString.slice(1);
  }
  const trimmed = rawString.trim();

  // 1. Strict pre-parse checks for DOCTYPE and ENTITY (XXE protection)
  if (/<!ENTITY/i.test(trimmed) || /<!DOCTYPE/i.test(trimmed)) {
    return {
      valid: false,
      error: 'Security violation: SVG contains forbidden <!DOCTYPE> or <!ENTITY> declarations.',
    };
  }

  // 2. Parse SVG with real XML DOMParser with strict error trapping
  let parseErrors: string[] = [];
  const parser = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level === 'error' || level === 'fatalError') {
        parseErrors.push(msg);
      }
    },
  });

  let doc: any;
  try {
    doc = parser.parseFromString(trimmed, 'image/svg+xml');
  } catch (err: any) {
    return {
      valid: false,
      error: `Malformed SVG: XML parser failed to parse input: ${err?.message || err}`,
    };
  }

  if (parseErrors.length > 0) {
    return {
      valid: false,
      error: `Malformed SVG: ${parseErrors[0]}`,
    };
  }

  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    return {
      valid: false,
      error: 'Malformed SVG: document must have an <svg> root element.',
    };
  }

  // 3. Recursive AST node validation & sanitization
  let validationError: string | null = null;
  const MAX_SVG_DEPTH = 32;
  const MAX_SVG_NODE_COUNT = 2500;
  let totalNodeCount = 0;

  function sanitizeNode(node: any, depth = 0): boolean {
    if (validationError) return false;

    totalNodeCount++;
    if (totalNodeCount > MAX_SVG_NODE_COUNT) {
      validationError = `Security violation: SVG node count exceeds maximum complexity limit (${MAX_SVG_NODE_COUNT}).`;
      return false;
    }
    if (depth > MAX_SVG_DEPTH) {
      validationError = `Security violation: SVG element nesting depth exceeds maximum allowed limit (${MAX_SVG_DEPTH}).`;
      return false;
    }

    // Node Type 1: Element
    if (node.nodeType === 1) {
      const el = node as Element;
      const tagName = el.nodeName.toLowerCase();
      // Remove any namespace prefix for check (e.g., svg:path -> path)
      const cleanTagName = tagName.includes(':') ? tagName.split(':')[1] : tagName;

      // Reject non-allowlisted tags (scripts, foreignObject, iframe, audio, video, style, feTurbulence, etc.)
      if (!ALLOWED_SVG_TAGS.has(cleanTagName)) {
        validationError = `Security violation: Forbidden element <${el.nodeName}> detected in SVG.`;
        return false;
      }

      // Check attributes
      const attrsToRemove: string[] = [];
      const attrs = el.attributes;
      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        const rawAttrName = attr.name.toLowerCase();
        const cleanAttrName = rawAttrName.includes(':') ? rawAttrName.split(':')[1] : rawAttrName;
        const attrVal = attr.value.trim().toLowerCase();

        // 1. Check for malformed attribute names
        if (!/^[a-zA-Z0-9_:-]+$/.test(attr.name)) {
          validationError = `Security violation: Malformed attribute name '${attr.name}' in SVG.`;
          return false;
        }

        // 2. Reject xmlns reassignment to non-SVG/non-W3C namespaces (e.g. XHTML)
        if (cleanAttrName === 'xmlns' || rawAttrName === 'xmlns') {
          if (attrVal !== 'http://www.w3.org/2000/svg' && attrVal !== 'http://www.w3.org/1999/xlink') {
            validationError = `Security violation: Unauthorized xmlns namespace '${attr.value}'.`;
            return false;
          }
        }

        // 3. Reject event handlers (onload, onerror, onclick, etc.)
        if (cleanAttrName.startsWith('on') || rawAttrName.startsWith('on')) {
          validationError = `Security violation: Forbidden event handler '${attr.name}' detected in SVG.`;
          return false;
        }

        // 4. Reject executable schemes (javascript:, vbscript:, data:text/html, etc.)
        if (
          attrVal.includes('javascript:') ||
          attrVal.includes('vbscript:') ||
          attrVal.includes('data:text/html') ||
          attrVal.includes('data:application/javascript')
        ) {
          validationError = `Security violation: Forbidden URI scheme in attribute '${attr.name}'.`;
          return false;
        }

        // 5. Reject dangerous CSS keywords across all attributes (including style)
        if (
          attrVal.includes('@import') ||
          attrVal.includes('behavior:') ||
          attrVal.includes('expression(') ||
          attrVal.includes('-moz-binding')
        ) {
          validationError = `Security violation: Dangerous CSS directive detected in attribute '${attr.name}'.`;
          return false;
        }

        // 6. Handle href and xlink:href — only local fragment identifiers (#id) or safe embedded raster image data URIs are permitted
        if (cleanAttrName === 'href' || rawAttrName === 'xlink:href' || rawAttrName === 'href') {
          if (attrVal.startsWith('http:') || attrVal.startsWith('https:') || attrVal.startsWith('//')) {
            validationError = `Security violation: External URL reference '${attr.value}' forbidden in attribute '${attr.name}'.`;
            return false;
          }
          if (attrVal.startsWith('data:')) {
            // Allow only safe embedded image data URIs (PNG, JPEG, WebP, GIF)
            const isSafeRasterDataUri = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(attrVal.replace(/\s+/g, ''));
            if (!isSafeRasterDataUri) {
              validationError = `Security violation: Non-image or unsafe data URI in attribute '${attr.name}'.`;
              return false;
            }
          } else if (!attrVal.startsWith('#') && !attrVal.startsWith('./') && attrVal.length > 0) {
            validationError = `Security violation: Non-fragment reference in '${attr.name}'.`;
            return false;
          }
        }

        // 7. Reject CSS external or data resources in style or url() attributes
        if (attrVal.includes('url(')) {
          if (attrVal.includes('http:') || attrVal.includes('https:') || attrVal.includes('//') || attrVal.includes('data:')) {
            validationError = `Security violation: External or data URL detected in property value '${attr.value}'.`;
            return false;
          }
        }

        // 8. Allowlist check for attribute name
        if (!ALLOWED_SVG_ATTRS.has(cleanAttrName) && !ALLOWED_SVG_ATTRS.has(rawAttrName)) {
          // Non-allowlisted attribute; strip it safely
          attrsToRemove.push(attr.name);
        }
      }

      for (const attrName of attrsToRemove) {
        el.removeAttribute(attrName);
      }

      // Recursively sanitize children with depth tracking
      const childNodes = Array.from(el.childNodes);
      for (const child of childNodes) {
        sanitizeNode(child, depth + 1);
        if (validationError) return false;
      }
    } else if (node.nodeType === 7 || node.nodeType === 8) {
      // ProcessingInstruction or Comment - remove comments with potential script injections
      const text = (node.nodeValue || '').toLowerCase();
      if (text.includes('<script') || text.includes('javascript:')) {
        validationError = 'Security violation: Malicious content in XML comment or processing instruction.';
        return false;
      }
    }

    return true;
  }

  const success = sanitizeNode(root, 0);
  if (!success || validationError) {
    return {
      valid: false,
      error: validationError || 'SVG sanitization failed.',
    };
  }

  // 4. Extract geometry (width, height, viewBox)
  const viewBoxAttr = root.getAttribute('viewBox') || root.getAttribute('viewbox') || '';
  const widthAttr = root.getAttribute('width') || '';
  const heightAttr = root.getAttribute('height') || '';

  let width: number | undefined;
  let height: number | undefined;

  if (widthAttr) {
    const parsed = parseFloat(widthAttr.replace(/px|pt/g, ''));
    if (!isNaN(parsed) && parsed > 0) width = Math.round(parsed);
  }
  if (heightAttr) {
    const parsed = parseFloat(heightAttr.replace(/px|pt/g, ''));
    if (!isNaN(parsed) && parsed > 0) height = Math.round(parsed);
  }

  if ((!width || !height) && viewBoxAttr) {
    const parts = viewBoxAttr.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2] > 0 && parts[3] > 0) {
      width = width || Math.round(parts[2]);
      height = height || Math.round(parts[3]);
    }
  }

  width = width && width > 0 ? width : 400;
  height = height && height > 0 ? height : 120;

  // Ensure default root attributes for proper rendering
  if (!root.getAttribute('xmlns')) {
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  // 5. Serialize sanitized XML back to string
  const serializer = new XMLSerializer();
  const sanitizedString = serializer.serializeToString(doc);

  return {
    valid: true,
    sanitizedBuffer: Buffer.from(sanitizedString, 'utf8'),
    cleanSvg: sanitizedString,
    width,
    height,
    viewBox: viewBoxAttr || undefined,
  };
}

/**
 * Validates file type, extension, and size before processing.
 */
export function validateFileMetadata(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  options?: FileValidationOptions
): FileValidationResult {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: 'Filename is required.' };
  }

  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return {
      valid: false,
      error: 'Security violation: path traversal or directory separator detected in filename.',
    };
  }

  if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return { valid: false, error: 'File cannot be empty (0 bytes).' };
  }

  const lowerName = filename.toLowerCase();

  // Check for double extensions or dangerous extensions (e.g. image.php.jpg or shell.sh)
  const parts = lowerName.split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'File must have a valid extension.' };
  }

  for (let i = 1; i < parts.length; i++) {
    const extCandidate = `.${parts[i]}`;
    if (DANGEROUS_EXTENSIONS.includes(extCandidate)) {
      return {
        valid: false,
        error: `Security violation: forbidden extension '${extCandidate}' detected in filename.`,
      };
    }
  }

  const ext = path.extname(lowerName);
  const normalizedMime = (mimeType || '').toLowerCase().trim();
  const allowSvg = Boolean(options?.allowSvg) || isLogoOrIdentityContext(options?.category, options?.entityType);

  // Explicit handling for SVG files
  if (ext === '.svg' || normalizedMime === 'image/svg+xml') {
    if (!allowSvg) {
      return {
        valid: false,
        error: 'SVG files are only permitted for Developer, Builder, or Brand Logo uploads. Property photographs and floor plans must use JPG, PNG, WebP, AVIF, or PDF.',
      };
    }
    if (ext !== '.svg' || normalizedMime !== 'image/svg+xml') {
      return {
        valid: false,
        error: `Extension '${ext}' does not match MIME type '${normalizedMime}' for SVG logo upload.`,
      };
    }
    if (sizeBytes > MAX_SVG_SIZE_BYTES) {
      return {
        valid: false,
        error: `SVG file size (${sizeBytes} bytes) exceeds maximum limit of ${MAX_SVG_SIZE_BYTES} bytes (5MB).`,
      };
    }
    return {
      valid: true,
      sanitizedFilename: sanitizeFilename(filename),
      detectedType: 'SVG_LOGO',
    };
  }

  if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
    return {
      valid: false,
      error: `Unsupported file extension '${ext}'. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}${allowSvg ? ', .svg' : ''}`,
    };
  }

  const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(normalizedMime as any);
  const isDoc = ALLOWED_DOCUMENT_MIME_TYPES.includes(normalizedMime as any);

  if (!isImage && !isDoc) {
    return {
      valid: false,
      error: `Unsupported MIME type '${normalizedMime}'.`,
    };
  }

  // Verify extension matches MIME class
  if (isDoc && ext !== '.pdf') {
    return {
      valid: false,
      error: 'MIME type application/pdf requires .pdf file extension.',
    };
  }

  if (isImage && ext === '.pdf') {
    return {
      valid: false,
      error: 'Image MIME type cannot use .pdf extension.',
    };
  }

  if (isImage && sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image size (${sizeBytes} bytes) exceeds maximum limit of ${MAX_IMAGE_SIZE_BYTES} bytes (10MB).`,
    };
  }

  if (isDoc && sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `Document size (${sizeBytes} bytes) exceeds maximum limit of ${MAX_DOCUMENT_SIZE_BYTES} bytes (25MB).`,
    };
  }

  return {
    valid: true,
    sanitizedFilename: sanitizeFilename(filename),
    detectedType: isImage ? 'IMAGE' : 'DOCUMENT',
  };
}

/**
 * Checks whether a media asset ID is actively referenced as a floor plan on any project configuration.
 */
export async function isFloorPlanMediaReferenced(mediaId: string): Promise<boolean> {
  if (!mediaId) return false;
  try {
    const { mediaRepository } = await import('@/src/domain/media/repositories/mediaRepository');
    const res = await mediaRepository.checkReferenced(mediaId);
    return res.referenced;
  } catch {
    return false;
  }
}

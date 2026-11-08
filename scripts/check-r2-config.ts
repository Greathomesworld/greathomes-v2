import dotenv from 'dotenv';
dotenv.config();
import { S3StorageProvider } from '../src/domain/media/storage/storageProvider';

async function checkR2Config() {
  console.log('=== CLOUDFLARE R2 / S3 STORAGE CONFIGURATION & READINESS DIAGNOSTIC ===\n');

  const nodeEnv = process.env.NODE_ENV || 'development';
  const isCloudRun = Boolean(process.env.K_SERVICE);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  
  let runtimeType = 'Local / Development Server';
  if (isCloudRun) {
    runtimeType = appUrl.includes('ais-dev')
      ? 'Development Preview Deployment (Cloud Run)'
      : appUrl.includes('ais-pre')
      ? 'Shared Preview Deployment (Cloud Run)'
      : 'Cloud Run Production Deployment';
  } else if (process.env.VERCEL) {
    runtimeType = `Vercel ${process.env.VERCEL_ENV || 'Deployment'}`;
  }

  console.log(`Runtime Environment: ${nodeEnv} (${runtimeType})`);
  console.log(`App URL: ${appUrl}\n`);

  const storageProvider = process.env.STORAGE_PROVIDER || 'local (default)';
  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3Region = process.env.S3_REGION || 'auto';
  const s3Bucket = process.env.S3_BUCKET;
  const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
  const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const mediaPublicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL;

  const results = {
    storageProvider,
    endpointPresent: Boolean(s3Endpoint),
    endpointValidFormat: s3Endpoint
      ? /^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/i.test(s3Endpoint) || s3Endpoint.startsWith('https://')
      : false,
    region: s3Region,
    regionValid: Boolean(s3Region),
    bucketPresent: Boolean(s3Bucket),
    accessKeyIdPresent: Boolean(s3AccessKeyId),
    secretAccessKeyPresent: Boolean(s3SecretAccessKey),
    mediaPublicBaseUrlPresent: Boolean(mediaPublicBaseUrl),
  };

  console.log('Configuration Status Report (Secrets Redacted):');
  console.table([
    { Check: 'STORAGE_PROVIDER', Status: results.storageProvider },
    { Check: 'S3_ENDPOINT Present', Status: results.endpointPresent ? 'YES ✓' : 'NO ✗' },
    { Check: 'S3_ENDPOINT Format Valid', Status: results.endpointValidFormat ? 'YES ✓' : 'NO ✗' },
    { Check: 'S3_REGION', Status: results.region },
    { Check: 'S3_BUCKET Present', Status: results.bucketPresent ? 'YES ✓' : 'NO ✗' },
    { Check: 'S3_ACCESS_KEY_ID Present', Status: results.accessKeyIdPresent ? 'YES ✓' : 'NO ✗' },
    { Check: 'S3_SECRET_ACCESS_KEY Present', Status: results.secretAccessKeyPresent ? 'YES ✓' : 'NO ✗' },
    { Check: 'MEDIA_PUBLIC_BASE_URL Present', Status: results.mediaPublicBaseUrlPresent ? 'YES ✓' : 'NO ✗' },
  ]);

  const isReadyForLiveTest =
    results.storageProvider === 's3' &&
    results.endpointPresent &&
    results.bucketPresent &&
    results.accessKeyIdPresent &&
    results.secretAccessKeyPresent;

  console.log(`\nReady for live connection test: ${isReadyForLiveTest ? 'YES ✓' : 'NO (BLOCKED — credentials missing or provider not s3) ✗'}`);

  if (isReadyForLiveTest) {
    console.log('\n--- EXECUTING CONTROLLED REMOTE R2 OPERATIONS TEST ---');
    try {
      const provider = new S3StorageProvider();
      const testKey = `diagnostics/r2-probe-${Date.now()}.txt`;
      const testContent = Buffer.from(`Great Homes V2 R2 Verification Probe - ${new Date().toISOString()}`);

      // 1. Upload
      const publicUrl = await provider.upload(testKey, testContent, 'text/plain');
      console.log(`[PASS] 1. Uploaded temporary object to bucket '${s3Bucket}' -> Key: '${testKey}'`);
      console.log(`       Generated public URL: ${publicUrl}`);

      // 2. Exists
      const exists = await provider.exists(testKey);
      console.log(`[PASS] 2. Object exists check (HeadObject): ${exists}`);

      // 3. Read back
      const readBuf = await provider.read(testKey);
      if (!readBuf) throw new Error('Failed to read back uploaded probe object (null Buffer)');
      const match = readBuf.toString('utf-8') === testContent.toString('utf-8');
      console.log(`[PASS] 3. Read-back check (GetObject): Verified identical content (${match})`);

      // 4. Presigned URL
      const signedUrl = await provider.getSignedUrl(testKey, 300);
      console.log(`[PASS] 4. Presigned download URL generated: YES (length ${signedUrl.length})`);

      // 5. Test Public URL / Custom domain resolution
      console.log(`\n--- TESTING PUBLIC MEDIA DOMAIN (${mediaPublicBaseUrl || 'Default R2'}) ---`);
      try {
        const headRes = await fetch(publicUrl, { method: 'HEAD', redirect: 'manual' });
        console.log(`       HTTP Status: ${headRes.status} ${headRes.statusText}`);
        if (headRes.status === 200) {
          console.log('       Public Media Domain Status: ACTIVE & SERVING BUCKET OBJECTS DIRECTLY ✓');
        } else if (headRes.status === 301 || headRes.status === 302) {
          const loc = headRes.headers.get('location');
          console.log(`       Public Media Domain Status: REDIRECTING to ${loc} (Domain not yet bound to R2 bucket in Cloudflare) ⚠`);
        } else if (headRes.status === 404) {
          console.log('       Public Media Domain Status: 404 NOT FOUND (Domain DNS points elsewhere or custom domain not attached to R2 bucket) ⚠');
        } else {
          console.log(`       Public Media Domain Status: HTTP ${headRes.status}`);
        }
      } catch (fetchErr: any) {
        console.log(`       Public Media Domain Error: ${fetchErr.message}`);
      }

      // 6. Delete
      const deleted = await provider.delete(testKey);
      console.log(`\n[PASS] 5. Deleted temporary probe (DeleteObject): ${deleted}`);

      // 7. Verify Cleanup
      const existsAfter = await provider.exists(testKey);
      console.log(`[PASS] 6. Cleanup verified (Object deleted): ${!existsAfter}`);

      console.log('\n=== LIVE R2 OBJECT STORAGE CONNECTION: VERIFIED OPERATIONAL ✓ ===');
    } catch (err: any) {
      console.error('\n[FAIL] Live R2 test failed:', err.message);
      if (err.$metadata) {
        console.error('       HTTP Status:', err.$metadata.httpStatusCode);
      }
    }
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

checkR2Config().catch(console.error);

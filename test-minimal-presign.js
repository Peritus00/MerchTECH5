const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = 'us-east-2';
const BUCKET = 'merchtechbucket';
const KEY = 'full-featured-test.txt';
const CONTENT_TYPE = 'text/plain';
const CACHE_CONTROL = 'max-age=31536000';
const META_userid = 'testuser';
const META_uploadedat = new Date().toISOString();
const META_originalname = 'full-featured-test.txt';

async function main() {
  const s3 = new S3Client({ region: REGION });
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    ContentType: CONTENT_TYPE,
    CacheControl: CACHE_CONTROL,
    Metadata: {
      userid: META_userid,
      uploadedat: META_uploadedat,
      originalname: META_originalname,
    },
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  console.log('Presigned PUT URL:', url);
  console.log('\nUse this curl command to upload:');
  console.log(`curl -v -X PUT -T full-featured-test.txt \
  -H "Content-Type: ${CONTENT_TYPE}" \
  -H "Cache-Control: ${CACHE_CONTROL}" \
  -H "x-amz-meta-userid: ${META_userid}" \
  -H "x-amz-meta-uploadedat: ${META_uploadedat}" \
  -H "x-amz-meta-originalname: ${META_originalname}" \
  "${url}"`);
}

main().catch(console.error); 
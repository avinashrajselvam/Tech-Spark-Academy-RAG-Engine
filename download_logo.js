import https from 'https';
import fs from 'fs';
import path from 'path';

const url = 'https://i.ibb.co/3yn3T1c/Tech-Spark-Academy-Logo.jpg';
const dest = path.join(process.cwd(), 'public', 'logo.jpg');

const file = fs.createWriteStream(dest);

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
    if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
            file.close(() => {
                console.log('Download complete');
            });
        });
    } else {
        console.error(`Download failed: ${response.statusCode}`);
        if (response.headers.location) {
            console.log(`Redirecting to: ${response.headers.location}`);
        }
    }
}).on('error', (err) => {
    fs.unlink(dest, () => { });
    console.error(`Error: ${err.message}`);
});

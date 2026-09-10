require('dotenv').config();

const app = require('./app');
const { startCronJobs } = require('./cron');

const PORT = process.env.PORT || 3000;

startCronJobs();

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
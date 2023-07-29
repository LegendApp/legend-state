import { observable } from '@legendapp/state';

const MSPerMinute = 60000;

function clearTime(date: Date | number) {
    date = new Date(date);
    date.setHours(0, 0, 0, 0);
    return date;
}

let time = new Date();
const currentTime = observable(time);
const currentDay = observable(clearTime(time));
const timeToSecond = (60 - time.getSeconds() + 1) * 1000;
function update() {
    const now = new Date();
    currentTime.set(now);

    if (now.getDate() !== time.getDate()) {
        currentDay.set(clearTime(now));
    }

    time = now;
}
setTimeout(() => {
    update();
    setInterval(update, MSPerMinute);
}, timeToSecond);

export { currentTime, currentDay };

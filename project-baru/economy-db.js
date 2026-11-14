const db = require('./database');
const rawDb = db.raw;

function getInventory(userId) {
    return rawDb.prepare('SELECT item_id, amount FROM inventory WHERE user_id = ?').all(String(userId));
}
function getItem(userId, itemId) {
    return rawDb.prepare('SELECT amount FROM inventory WHERE user_id = ? AND item_id = ?').get(String(userId), itemId);
}
function addItem(userId, itemId, amount = 1) {
    const existing = getItem(userId, itemId);
    if (existing) {
        rawDb.prepare('UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND item_id = ?').run(amount, String(userId), itemId);
    } else {
        rawDb.prepare('INSERT INTO inventory (user_id, item_id, amount) VALUES (?, ?, ?)').run(String(userId), itemId, amount);
    }
}
function removeItem(userId, itemId, amount = 1) {
    const existing = getItem(userId, itemId);
    if (!existing || existing.amount < amount) return false;
    if (existing.amount === amount) {
        rawDb.prepare('DELETE FROM inventory WHERE user_id = ? AND item_id = ?').run(String(userId), itemId);
    } else {
        rawDb.prepare('UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND item_id = ?').run(amount, String(userId), itemId);
    }
    return true;
}
// Tambahkan di bawah fungsi removeItem
function getItemWithDurability(userId, itemId) {
    return rawDb.prepare('SELECT amount, durability FROM inventory WHERE user_id = ? AND item_id = ?').get(String(userId), itemId);
}

function setDurability(userId, itemId, durability) {
    rawDb.prepare('UPDATE inventory SET durability = ? WHERE user_id = ? AND item_id = ?')
         .run(durability, String(userId), itemId);
}

module.exports = { getInventory, getItem, addItem, removeItem, getItemWithDurability, setDurability };
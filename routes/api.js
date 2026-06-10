import express from 'express';

const router = express.Router();

// 公告
// nav buttons
router.get('/nav-buttons', async (req, res) => {
  try {
    const db = req.app.locals.pool;

    const result = await db.query(
      'SELECT * FROM nav_buttons ORDER BY parent_id ASC, sort_order ASC'
    );

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// nav buttons
catch (err) {
  console.error(err); // ⭐一定要
  res.status(500).json({ success: false, error: err.message });
}
    const result = await db.query(
      'SELECT * FROM nav_buttons ORDER BY parent_id ASC, sort_order ASC'
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// settings
router.get('/settings', async (req, res) => {
  try {
    const db = req.app.locals.pool;

    const result = await db.query('SELECT * FROM site_settings');

    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);

    res.json({ success: true, data: settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

export default router;

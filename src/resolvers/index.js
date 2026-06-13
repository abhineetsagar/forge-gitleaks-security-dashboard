import Resolver from '@forge/resolver';
import { storage, startsWith, webTrigger, route } from '@forge/api';
import api from '@forge/api';

const resolver = new Resolver();

const resolveUser = async (accountId) => {
  try {
    const resp = await api.asApp().requestBitbucket(route`/2.0/users/${accountId}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.display_name || data.nickname || accountId;
    }
  } catch (e) { /* fall through */ }
  return accountId;
};

resolver.define('getWebhookUrl', async () => {
    try {
      const url = await webTrigger.getUrl("gitleaks-ingest-webhook");
      return url;
    } catch (e) {
      return "URL generation failed (must be viewed by admin initially)";
    }
});

resolver.define('getScans', async () => {
    const results = [];
    let cursor = null;
    
    do {
      const { results: items, nextCursor } = await storage.query()
        .where('key', startsWith('scan_'))
        .limit(20)
        .cursor(cursor)
        .getMany();
        
      results.push(...items);
      cursor = nextCursor;
    } while (cursor);
    return results;
});

resolver.define('getIgnored', async () => {
    const results = [];
    let cursor = null;
    
    do {
      const { results: items, nextCursor } = await storage.query()
        .where('key', startsWith('ignore_'))
        .limit(20)
        .cursor(cursor)
        .getMany();
        
      results.push(...items);
      cursor = nextCursor;
    } while (cursor);
    
    return results;
});

resolver.define('ignoreSecret', async ({ payload }) => {
    const { fingerprint, reason } = payload;
    const timestamp = new Date().toISOString();
    await storage.set(`ignore_${fingerprint}`, { reason, timestamp });
    return true;
});

resolver.define('bulkIgnoreSecrets', async (req) => {
    const { fingerprints, reason, details } = req.payload;
    const timestamp = new Date().toISOString();
    await Promise.all(fingerprints.map(fingerprint => 
        storage.set(`ignore_${fingerprint}`, { reason, timestamp })
    ));
    
    const accountId = req.context.accountId || 'Unknown';
    const displayName = await resolveUser(accountId);
    const reposStr = details?.repos ? details.repos.join(', ') : 'unknown repo';
    const filesStr = details?.files ? details.files.join(', ') : '';
    const logId = `auditlog_${timestamp}_${Math.random().toString(36).substring(7)}`;
    await storage.set(logId, {
      action: 'IGNORE',
      accountId,
      displayName,
      count: details?.count || fingerprints.length,
      repos: reposStr,
      files: filesStr,
      reason: reason || '',
      timestamp
    });
    return true;
});

resolver.define('restoreSecret', async (req) => {
    const { fingerprint, repo, file } = req.payload;
    await storage.delete(`ignore_${fingerprint}`);
    
    const timestamp = new Date().toISOString();
    const accountId = req.context.accountId || 'Unknown';
    const displayName = await resolveUser(accountId);
    const logId = `auditlog_${timestamp}_${Math.random().toString(36).substring(7)}`;
    await storage.set(logId, {
      action: 'RESTORE',
      accountId,
      displayName,
      count: 1,
      repos: repo || 'unknown repo',
      files: file || '',
      reason: '',
      timestamp
    });
    return true;
});

resolver.define('getAuditLogs', async () => {
    const results = [];
    let cursor = null;
    
    do {
      const { results: items, nextCursor } = await storage.query()
        .where('key', startsWith('auditlog_'))
        .limit(50)
        .cursor(cursor)
        .getMany();
        
      results.push(...items);
      cursor = nextCursor;
    } while (cursor && results.length < 50);
    
    results.sort((a, b) => new Date(b.value.timestamp) - new Date(a.value.timestamp));
    return results.slice(0, 50);
});

export const handler = resolver.getDefinitions();

export async function ingest(request) {
  try {
    const authHeaderArray = request.headers && request.headers.authorization;
    const authHeader = authHeaderArray && authHeaderArray.length > 0 ? authHeaderArray[0] : null;
    
    const expectedSecret = process.env.WEBHOOK_SECRET;
    
    if (!expectedSecret) {
      return {
        body: "Internal Server Error: WEBHOOK_SECRET environment variable is not configured",
        headers: { "Content-Type": ["text/plain"] },
        statusCode: 500,
      };
    }
    
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return {
        body: "Forbidden: Invalid Shared Secret Token",
        headers: { "Content-Type": ["text/plain"] },
        statusCode: 403,
      };
    }

    const payload = JSON.parse(request.body);
    const { repo, team, count, secrets, excluded } = payload;
    
    const timestamp = new Date().toISOString();
    await storage.set(`scan_${repo}`, { team, count, timestamp, secrets: secrets || [], excluded: excluded || false });
    
    return {
      body: "Data ingested successfully",
      headers: { "Content-Type": ["text/plain"] },
      statusCode: 200,
    };
  } catch (err) {
    return {
      body: `Error parsing payload: ${err.message}`,
      headers: { "Content-Type": ["text/plain"] },
      statusCode: 400,
    };
  }
}

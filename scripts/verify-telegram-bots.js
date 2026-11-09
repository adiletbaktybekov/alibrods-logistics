const fs = require('fs');
const path = require('path');

async function main() {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  const envLocalExists = fs.existsSync(envLocalPath);

  const localEnv = {};
  if (envLocalExists) {
    const raw = fs.readFileSync(envLocalPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const k = trimmed.split('=')[0].trim();
        let v = trimmed.slice(trimmed.indexOf('=') + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        localEnv[k] = v;
      }
    }
  }

  const driverToken = localEnv.TELEGRAM_DRIVER_BOT_TOKEN || process.env.TELEGRAM_DRIVER_BOT_TOKEN;
  const clientToken = localEnv.TELEGRAM_CLIENT_BOT_TOKEN || process.env.TELEGRAM_CLIENT_BOT_TOKEN;
  const managerToken = localEnv.TELEGRAM_MANAGER_BOT_TOKEN || process.env.TELEGRAM_MANAGER_BOT_TOKEN;
  const groupChatId = localEnv.TELEGRAM_MANAGER_GROUP_CHAT_ID || process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID;
  const groupTopicId = localEnv.TELEGRAM_MANAGER_GROUP_TOPIC_ID || process.env.TELEGRAM_MANAGER_GROUP_TOPIC_ID;
  const enableGroupNotif = localEnv.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS || process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS;

  const summary = {
    envLocalExists,
    tokensPresence: {
      TELEGRAM_DRIVER_BOT_TOKEN: Boolean(driverToken && driverToken.length > 5 && !driverToken.includes('<')),
      TELEGRAM_CLIENT_BOT_TOKEN: Boolean(clientToken && clientToken.length > 5 && !clientToken.includes('<')),
      TELEGRAM_MANAGER_BOT_TOKEN: Boolean(managerToken && managerToken.length > 5 && !managerToken.includes('<')),
    },
    groupChatIdConfigured: Boolean(groupChatId && groupChatId.length > 0 && !groupChatId.includes('<')),
    groupChatIdValue: groupChatId ? groupChatId : 'NOT_CONFIGURED',
    groupTopicIdConfigured: Boolean(groupTopicId && groupTopicId.length > 0 && !groupTopicId.includes('<')),
    groupTopicIdValue: groupTopicId ? groupTopicId : 'NOT_CONFIGURED',
    groupNotificationsEnabled: enableGroupNotif !== 'false',
  };

  console.log('CONFIG_VERIFICATION:', JSON.stringify(summary, null, 2));

  // If tokens exist, perform getMe and group checks without leaking tokens
  async function testBot(name, token, expectedUsername) {
    if (!token || token.includes('<')) {
      console.log(`${name}: TOKEN_MISSING`);
      return null;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.log(`${name}: GET_ME_FAILED (HTTP ${res.status}: ${data.description || 'error'})`);
        return null;
      }

      const match = data.result.username?.toLowerCase() === expectedUsername.toLowerCase();
      console.log(`${name}: GET_ME_SUCCESS`, {
        id: data.result.id,
        is_bot: data.result.is_bot,
        first_name: data.result.first_name,
        username: `@${data.result.username}`,
        expectedUsername: `@${expectedUsername}`,
        usernameMatches: match,
      });
      return data.result;
    } catch (err) {
      console.log(`${name}: NETWORK_ERROR (${err.message})`);
      return null;
    }
  }

  const driverMe = await testBot('DriverBot', driverToken, 'AliBrosDriverBot');
  const clientMe = await testBot('ClientBot', clientToken, 'AliBrosClientBot');
  const managerMe = await testBot('ManagerBot', managerToken, 'AliBrosManagerBot');

  if (managerMe && groupChatId) {
    console.log('\nTesting ManagerBot access to group:', groupChatId);
    try {
      const chatRes = await fetch(`https://api.telegram.org/bot${managerToken}/getChat?chat_id=${encodeURIComponent(groupChatId)}`);
      const chatData = await chatRes.json();
      if (chatRes.ok && chatData.ok) {
        console.log('GET_CHAT_SUCCESS:', {
          id: chatData.result.id,
          type: chatData.result.type,
          title: chatData.result.title,
        });

        // Test getChatMember
        const memberRes = await fetch(`https://api.telegram.org/bot${managerToken}/getChatMember?chat_id=${encodeURIComponent(groupChatId)}&user_id=${managerMe.id}`);
        const memberData = await memberRes.json();
        if (memberRes.ok && memberData.ok) {
          console.log('GET_CHAT_MEMBER_SUCCESS:', {
            status: memberData.result.status,
            can_post_messages: memberData.result.can_post_messages,
            can_send_messages: memberData.result.can_send_messages,
          });
        } else {
          console.log('GET_CHAT_MEMBER_FAILED:', memberData);
        }
      } else {
        console.log('GET_CHAT_FAILED:', chatData);
      }
    } catch (err) {
      console.log('GROUP_CHECK_ERROR:', err.message);
    }
  }
}

main().catch(console.error);

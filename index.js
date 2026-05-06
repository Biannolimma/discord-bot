require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const { Web3 } = require('web3');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const web3 = new Web3(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/');
const web3Polygon = new Web3('https://polygon-rpc.com/');
const web3Eth = new Web3('https://cloudflare-eth.com/');
const solana = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

let wallets = {};
let botWallets = {};
let lastActive = {};
const walletsFile = './wallets.json';
const botWalletsFile = './botWallets.json';
const activeFile = './lastActive.json';

if (fs.existsSync(walletsFile)) {
  wallets = JSON.parse(fs.readFileSync(walletsFile));
}

if (fs.existsSync(botWalletsFile)) {
  botWallets = JSON.parse(fs.readFileSync(botWalletsFile));
} else {
  const bscAccount = web3.eth.accounts.create();
  botWallets.bsc = { address: bscAccount.address, privateKey: bscAccount.privateKey };
  const polygonAccount = web3Polygon.eth.accounts.create();
  botWallets.polygon = { address: polygonAccount.address, privateKey: polygonAccount.privateKey };
  const ethAccount = web3Eth.eth.accounts.create();
  botWallets.eth = { address: ethAccount.address, privateKey: ethAccount.privateKey };
  const solKeypair = Keypair.generate();
  botWallets.solana = { publicKey: solKeypair.publicKey.toString(), secretKey: Array.from(solKeypair.secretKey) };
  fs.writeFileSync(botWalletsFile, JSON.stringify(botWallets, null, 2));
}

if (fs.existsSync(activeFile)) {
  lastActive = JSON.parse(fs.readFileSync(activeFile));
}

let config = {
  prefix: '!',
  name: 'Wallet Bot'
};

const configFile = './config.json';

if (fs.existsSync(configFile)) {
  config = JSON.parse(fs.readFileSync(configFile));
} else {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

function saveConfig() {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

function saveWallets() {
  fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 2));
}

function handleCurrencies(message) {
  const embed = new EmbedBuilder()
    .setTitle('💰 Supported Currencies')
    .setDescription('The bot supports the following blockchains:')
    .addFields(
      { name: 'BSC (Binance Smart Chain)', value: 'Native token: BNB', inline: false },
      { name: 'Polygon', value: 'Native token: MATIC', inline: false },
      { name: 'Ethereum', value: 'Native token: ETH', inline: false },
      { name: 'Solana', value: 'Native token: SOL', inline: false }
    )
    .setColor(0x00ff00)
    .setFooter({ text: config.name })
    .setTimestamp();

  const closeRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('close_message')
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
    );

  message.reply({ embeds: [embed], components: [closeRow] });
}

client.once('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}!`);

  const restartFlagFile = './restarting.flag';
  if (fs.existsSync(restartFlagFile)) {
    const channelId = fs.readFileSync(restartFlagFile, 'utf-8');
    fs.unlinkSync(restartFlagFile);
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        const restartedEmbed = new EmbedBuilder()
          .setTitle('✅ Bot Restarted')
          .setDescription('The bot has successfully restarted and is now online.')
          .setColor(0x00ff00)
          .setFooter({ text: config.name })
          .setTimestamp();
        await channel.send({ embeds: [restartedEmbed] });
      }
    } catch (error) {
      console.error('Failed to send restart notification:', error);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  lastActive[message.author.id] = Date.now();
  fs.writeFileSync(activeFile, JSON.stringify(lastActive));

  if (message.content.startsWith(config.prefix)) {
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    switch (command) {
      case 'ping':
        const pingEmbed = new EmbedBuilder()
          .setTitle('🏓 Bot Status')
          .setDescription('The bot is operational and functioning correctly.')
          .setColor(0x00ff00)
          .setFooter({ text: config.name })
          .setTimestamp();
        message.reply({ embeds: [pingEmbed] });
        break;
      case 'wallet':
        await handleWallet(message, args);
        break;
      case 'help':
        handleHelp(message);
        break;
      case 'giveaway':
        await handleGiveaway(message, args);
        break;
      case 'rain':
        await handleRain(message, args);
        break;
      case 'balance':
        await handleBalance(message, args);
        break;
      case 'currencies':
        handleCurrencies(message);
        break;
      case 'airdrop':
        await handleAirdrop(message, args);
        break;
      case 'tip':
        await handleTip(message, args);
        break;
      case 'history':
        handleHistory(message);
        break;
      case 'settings':
        await handleSettings(message, args, client);
        break;
      case 'restart':
        await handleRestart(message, args);
        break;
      default:
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Command Not Recognized')
          .setDescription(`Use ${config.prefix}help for available commands.`)
          .setColor(0xff0000)
          .setFooter({ text: config.name })
          .setTimestamp();
        message.reply({ embeds: [errorEmbed] });
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === 'close_message') {
      await interaction.message.delete();
      return;
    }
    if (interaction.customId.startsWith('help_')) {
      const category = interaction.customId.split('_')[1];
      const isAdmin = interaction.member.permissions.has('Administrator');
      const isOwner = interaction.member.id === interaction.guild.ownerId;
      let title, fields, page;

      if (category === 'wallet') {
        title = '📋 Help - Wallet Commands';
        fields = [
          { name: `${config.prefix}wallet <chain>`, value: 'Generate or view your wallet address (bsc, solana, polygon, eth)', inline: false },
          { name: `${config.prefix}balance <chain|all|nonzero>`, value: 'Check wallet balances', inline: false },
          { name: `${config.prefix}currencies`, value: 'List supported currencies', inline: false }
        ];
        page = `1/${isAdmin ? 3 : 2}`;
      } else if (category === 'admin') {
        if (!isAdmin) {
          await interaction.deferUpdate();
          await interaction.editReply({ content: 'Access denied.', embeds: [], components: [] });
          return;
        }
        title = '📋 Help - Admin Commands';
        fields = [
          { name: `${config.prefix}giveaway <chain> <amount>`, value: 'Start a giveaway to distribute tokens (all chains)', inline: false },
          { name: `${config.prefix}rain <chain> <totalAmount> [numRecipients]`, value: 'Distribute tokens randomly to users', inline: false },
          { name: `${config.prefix}airdrop <chain> <amount> <numUsers> <seconds>`, value: 'Schedule airdrop after X seconds to active users', inline: false }
        ];
        if (isOwner) {
          fields.push({ name: `${config.prefix}settings`, value: 'Open bot configuration', inline: false });
        }
        page = '2/3';
      } else if (category === 'info') {
        title = '📋 Help - Info Commands';
        fields = [
          { name: `${config.prefix}tip @user <amount> <chain>`, value: 'Send tokens to another user (bsc, polygon, eth, solana)', inline: false },
          { name: `${config.prefix}history`, value: 'View your transaction history', inline: false },
          { name: `${config.prefix}ping`, value: 'Check bot status', inline: false }
        ];
        page = `${isAdmin ? 3 : 2}/${isAdmin ? 3 : 2}`;
      }

      const newEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription('Select a category using the buttons below.')
        .addFields(...fields)
        .setColor(0x0099ff)
        .setFooter({ text: `${config.name} - Page ${page}` })
        .setTimestamp();

      const buttons = [
        new ButtonBuilder()
          .setCustomId('help_wallet')
          .setLabel('Wallet')
          .setStyle(category === 'wallet' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      ];

      if (isAdmin) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('help_admin')
            .setLabel('Admin')
            .setStyle(category === 'admin' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );
      }

      buttons.push(
        new ButtonBuilder()
          .setCustomId('help_info')
          .setLabel('Info')
          .setStyle(category === 'info' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );

      const helpRow = new ActionRowBuilder().addComponents(...buttons);

      await interaction.update({ embeds: [newEmbed], components: [helpRow] });
      return;
    }
    if (interaction.customId === 'change_prefix') {
      const modal = new ModalBuilder()
        .setCustomId('prefix_modal')
        .setTitle('Change Bot Prefix');

      const prefixInput = new TextInputBuilder()
        .setCustomId('prefix_input')
        .setLabel('New Prefix')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter new prefix (e.g., ?)');

      const firstActionRow = new ActionRowBuilder().addComponents(prefixInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    } else if (interaction.customId === 'change_name') {
      const modal = new ModalBuilder()
        .setCustomId('name_modal')
        .setTitle('Change Bot Name');

      const nameInput = new TextInputBuilder()
        .setCustomId('name_input')
        .setLabel('New Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter new bot name');

      const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    } else if (interaction.customId === 'change_avatar') {
      const modal = new ModalBuilder()
        .setCustomId('avatar_modal')
        .setTitle('Change Bot Avatar');

      const avatarInput = new TextInputBuilder()
        .setCustomId('avatar_input')
        .setLabel('Avatar Image URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter image URL (PNG/JPG)');

      const firstActionRow = new ActionRowBuilder().addComponents(avatarInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'prefix_modal') {
      const newPrefix = interaction.fields.getTextInputValue('prefix_input');
      config.prefix = newPrefix;
      saveConfig();

      const embed = new EmbedBuilder()
        .setTitle('✅ Prefix Updated')
        .setDescription(`New prefix: ${newPrefix}`)
        .setColor(0x00ff00)
        .setFooter({ text: config.name })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else if (interaction.customId === 'name_modal') {
      const newName = interaction.fields.getTextInputValue('name_input');
      config.name = newName;
      saveConfig();

      try {
        await interaction.guild.members.me.setNickname(newName);
      } catch (error) {
        console.error('Failed to set nickname:', error);
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Name Updated')
        .setDescription(`New name: ${newName}`)
        .setColor(0x00ff00)
        .setFooter({ text: config.name })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else if (interaction.customId === 'avatar_modal') {
      const avatarUrl = interaction.fields.getTextInputValue('avatar_input');

      try {
        const fetch = require('node-fetch');
        const response = await fetch(avatarUrl);
        if (!response.ok) throw new Error('Failed to fetch image');
        const buffer = await response.arrayBuffer();

        await client.user.setAvatar(Buffer.from(buffer));

        const embed = new EmbedBuilder()
          .setTitle('✅ Avatar Updated')
          .setDescription('Bot avatar has been changed successfully.')
          .setColor(0x00ff00)
          .setFooter({ text: config.name })
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Failed to set avatar:', error);
        const embed = new EmbedBuilder()
          .setTitle('❌ Avatar Update Failed')
          .setDescription('Ensure the URL is valid and accessible. The bot may lack permission to change avatar.')
          .setColor(0xff0000)
          .setFooter({ text: config.name })
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      }
    }
  }
});

// Handlers

async function handleWallet(message, args) {
  const userId = message.author.id;
  const username = message.author.username;
  const chain = args[0]?.toLowerCase();

  if (!chain) {
    const embed = new EmbedBuilder()
      .setTitle('❓ Specify Blockchain')
      .setDescription(`Please specify a blockchain: ${config.prefix}wallet bsc, solana, polygon, eth`)
      .setColor(0xffa500)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  if (!wallets[userId]) wallets[userId] = {};

  let address;
  try {
    switch (chain) {
      case 'bsc':
        if (!wallets[userId].bsc) {
          const account = web3.eth.accounts.create();
          wallets[userId].bsc = { address: account.address, privateKey: account.privateKey };
          saveWallets();
        }
        address = wallets[userId].bsc.address;
        break;
      case 'solana':
        if (!wallets[userId].solana) {
          const keypair = Keypair.generate();
          wallets[userId].solana = { publicKey: keypair.publicKey.toString(), secretKey: Array.from(keypair.secretKey) };
          saveWallets();
        }
        address = wallets[userId].solana.publicKey;
        break;
      case 'polygon':
        if (!wallets[userId].polygon) {
          const account = web3Polygon.eth.accounts.create();
          wallets[userId].polygon = { address: account.address, privateKey: account.privateKey };
          saveWallets();
        }
        address = wallets[userId].polygon.address;
        break;
      case 'eth':
        if (!wallets[userId].eth) {
          const account = web3Eth.eth.accounts.create();
          wallets[userId].eth = { address: account.address, privateKey: account.privateKey };
          saveWallets();
        }
        address = wallets[userId].eth.address;
        break;
      default:
        const embed = new EmbedBuilder()
          .setTitle('❌ Unsupported Blockchain')
          .setDescription('Supported options: bsc, solana, polygon, eth.')
          .setColor(0xff0000)
          .setFooter({ text: config.name })
          .setTimestamp();
        message.reply({ embeds: [embed] });
        return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`💰 ${chain.toUpperCase()} Wallet`)
      .setDescription(`Your ${chain.toUpperCase()} wallet address is:`)
      .addFields({ name: 'Address', value: `\`${address}\``, inline: false })
      .setColor(0x00ff00)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while generating your wallet. Please try again later.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

function handleHelp(message) {
  const isAdmin = message.member.permissions.has('Administrator');
  const isOwner = message.author.id === message.guild.ownerId;

  const helpEmbed = new EmbedBuilder()
    .setTitle('📋 Help - Wallet Commands')
    .setDescription('Select a category using the buttons below.')
    .addFields(
      { name: `${config.prefix}wallet <bsc|solana>`, value: 'Generate or view your wallet address', inline: false },
      { name: `${config.prefix}balance <chain|all|nonzero>`, value: 'Check wallet balances', inline: false },
      { name: `${config.prefix}currencies`, value: 'List supported currencies', inline: false }
    )
    .setColor(0x0099ff)
    .setFooter({ text: `${config.name} - Page 1/${isAdmin ? 3 : 2}` })
    .setTimestamp();

  const buttons = [
    new ButtonBuilder()
      .setCustomId('help_wallet')
      .setLabel('Wallet')
      .setStyle(ButtonStyle.Primary)
  ];

  if (isAdmin) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('help_admin')
        .setLabel('Admin')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId('help_info')
      .setLabel('Info')
      .setStyle(ButtonStyle.Success)
  );

  const helpRow = new ActionRowBuilder().addComponents(...buttons);

  message.reply({ embeds: [helpEmbed], components: [helpRow] });
}

async function handleGiveaway(message, args) {
  if (!message.member.permissions.has('Administrator')) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Access Denied')
      .setDescription('Only server administrators can use giveaway.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const chain = args[0]?.toLowerCase();
  const amount = parseFloat(args[1]);

  if (!chain || !amount || isNaN(amount)) {
    const embed = new EmbedBuilder()
      .setTitle('❓ Correct Usage')
      .setDescription(`Usage: ${config.prefix}giveaway <chain> <amount> (e.g., ${config.prefix}giveaway bsc 0.01)`)
      .setColor(0xffa500)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  if (!['bsc', 'polygon', 'eth', 'solana'].includes(chain)) {
  const embed = new EmbedBuilder()
    .setTitle('💰 Supported Currencies')
    .setDescription('The bot supports the following blockchains:')
    .addFields(
      { name: 'BSC (Binance Smart Chain)', value: 'Native token: BNB', inline: false },
      { name: 'Polygon', value: 'Native token: MATIC', inline: false },
      { name: 'Ethereum', value: 'Native token: ETH', inline: false },
      { name: 'Solana', value: 'Native token: SOL', inline: false }
    )
    .setColor(0x00ff00)
    .setFooter({ text: config.name })
    .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const senderWallet = wallets[discordId][chain];
  const receiverWallet = wallets[targetUser.id][chain];

  if (!senderWallet || !receiverWallet) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Wallet Missing')
      .setDescription('Both users must have wallets for this chain.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  try {
    if (chain === 'bsc') {
      const tx = {
        from: senderWallet.address,
        to: receiverWallet.address,
        value: web3.utils.toWei(amount.toString(), 'ether'),
        gas: 21000,
      };
      const signedTx = await web3.eth.accounts.signTransaction(tx, senderWallet.privateKey);
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    } else if (chain === 'polygon') {
      const tx = {
        from: senderWallet.address,
        to: receiverWallet.address,
        value: web3Polygon.utils.toWei(amount.toString(), 'ether'),
        gas: 21000,
      };
      const signedTx = await web3Polygon.eth.accounts.signTransaction(tx, senderWallet.privateKey);
      await web3Polygon.eth.sendSignedTransaction(signedTx.rawTransaction);
    } else if (chain === 'eth') {
      const tx = {
        from: senderWallet.address,
        to: receiverWallet.address,
        value: web3Eth.utils.toWei(amount.toString(), 'ether'),
        gas: 21000,
      };
      const signedTx = await web3Eth.eth.accounts.signTransaction(tx, senderWallet.privateKey);
      await web3Eth.eth.sendSignedTransaction(signedTx.rawTransaction);
    } else if (chain === 'solana') {
      // Placeholder for Solana transfer
    }

    const embed = new EmbedBuilder()
      .setTitle('🎁 Tip Sent')
      .setDescription(`Successfully tipped ${amount} ${chain.toUpperCase()} to ${targetUser.username}.`)
      .setColor(0x00ff00)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Tip Failed')
      .setDescription('An error occurred while sending the tip. Ensure sufficient balance.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

function handleHistory(message) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Transaction History')
    .setDescription('Feature not implemented yet. Transactions are not stored.')
    .setColor(0xffa500)
    .setFooter({ text: config.name })
    .setTimestamp();
  message.reply({ embeds: [embed] });
}

async function handleSettings(message, args, client) {
  if (message.author.id !== message.guild.ownerId) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Access Denied')
      .setDescription('Only the server owner can access bot settings.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const configEmbed = new EmbedBuilder()
    .setTitle('⚙️ Bot Configuration')
    .setDescription('Click the buttons below to configure the bot.')
    .addFields(
      { name: 'Current Prefix', value: config.prefix, inline: true },
      { name: 'Current Name', value: config.name, inline: true }
    )
    .setColor(0x0099ff)
    .setFooter({ text: config.name })
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('change_prefix')
        .setLabel('Change Prefix')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('change_name')
        .setLabel('Change Name')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('change_avatar')
        .setLabel('Change Avatar')
        .setStyle(ButtonStyle.Success)
    );

  message.reply({ embeds: [configEmbed], components: [row] });
}

async function handleRestart(message, args) {
  if (message.author.id !== message.guild.ownerId) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Access Denied')
      .setDescription('Only the server owner can restart the bot.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  fs.writeFileSync('./restarting.flag', message.channel.id);
  const restartEmbed = new EmbedBuilder()
    .setTitle('🔄 Restarting Bot')
    .setDescription('Restarting.')
    .setColor(0xffa500)
    .setFooter({ text: config.name })
    .setTimestamp();
  const sentMessage = await message.reply({ embeds: [restartEmbed] });

  const animation = ['Restarting.', 'Restarting..', 'Restarting...', 'Restarting.'];
  for (let i = 0; i < animation.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const updatedEmbed = new EmbedBuilder()
      .setTitle('🔄 Restarting Bot')
      .setDescription(animation[i])
      .setColor(0xffa500)
      .setFooter({ text: config.name })
      .setTimestamp();
    await sentMessage.edit({ embeds: [updatedEmbed] });
  }
  process.exit(0);
}

client.login(process.env.DISCORD_TOKEN);
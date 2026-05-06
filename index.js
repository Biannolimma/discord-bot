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
          { name: `${config.prefix}wallet <bsc|solana>`, value: 'Generate or view your wallet address', inline: false },
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
          { name: `${config.prefix}giveaway <chain> <amount>`, value: 'Start a giveaway to distribute tokens', inline: false },
          { name: `${config.prefix}rain <chain> <totalAmount> [numRecipients]`, value: 'Distribute tokens randomly to users', inline: false },
          { name: `${config.prefix}airdrop <chain> <amount> <numUsers> <minutes>`, value: 'Airdrop to active users in last X minutes', inline: false }
        ];
        if (isOwner) {
          fields.push({ name: `${config.prefix}settings`, value: 'Open bot configuration', inline: false });
        }
        page = '2/3';
      } else if (category === 'info') {
        title = '📋 Help - Info Commands';
        fields = [
          { name: `${config.prefix}tip @user <amount> <chain>`, value: 'Send tokens to another user', inline: false },
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
      .setDescription(`Please specify a blockchain: ${config.prefix}wallet bsc or ${config.prefix}wallet solana`)
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
      default:
        const embed = new EmbedBuilder()
          .setTitle('❌ Unsupported Blockchain')
          .setDescription('Supported options: bsc, solana.')
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

  if (chain !== 'bsc' && chain !== 'solana') {
    const embed = new EmbedBuilder()
      .setTitle('❌ Unsupported Blockchain')
      .setDescription('Supported: bsc, solana.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  try {
    const members = await message.guild.members.fetch();
    const users = members.filter(m => !m.user.bot && wallets[m.id]?.[chain]);
    if (users.size === 0) {
      const embed = new EmbedBuilder()
        .setTitle('❌ No Eligible Users')
        .setDescription('No eligible users with wallets in this server.')
        .setColor(0xff0000)
        .setFooter({ text: config.name })
        .setTimestamp();
      message.reply({ embeds: [embed] });
      return;
    }

    const winner = users.random();
    const winnerAddress = wallets[winner.id][chain].address || wallets[winner.id][chain].publicKey;

    if (chain === 'bsc') {
      const tx = {
        from: botWallets.bsc.address,
        to: winnerAddress,
        value: web3.utils.toWei(amount.toString(), 'ether'),
        gas: 21000,
      };
      const signedTx = await web3.eth.accounts.signTransaction(tx, botWallets.bsc.privateKey);
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    } else if (chain === 'solana') {
      // Placeholder
    }

    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway Winner')
      .setDescription(`Winner: ${winner.user.username}\nAmount: ${amount} ${chain.toUpperCase()}\nSent to winner's wallet.`)
      .setColor(0x00ff00)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Giveaway Error')
      .setDescription('An error occurred during the giveaway. Ensure the bot wallet is funded.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

async function handleRain(message, args) {
  if (!message.member.permissions.has('Administrator')) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Access Denied')
      .setDescription('Only server administrators can use rain.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const chain = args[0]?.toLowerCase();
  const totalAmount = parseFloat(args[1]);
  const numRecipients = parseInt(args[2]) || 5;

  if (!chain || !totalAmount || isNaN(totalAmount)) {
    const embed = new EmbedBuilder()
      .setTitle('❓ Correct Usage')
      .setDescription(`Usage: ${config.prefix}rain <chain> <totalAmount> [numRecipients] (e.g., ${config.prefix}rain bsc 0.1 3)`)
      .setColor(0xffa500)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  if (chain !== 'bsc' && chain !== 'solana') {
    const embed = new EmbedBuilder()
      .setTitle('❌ Unsupported Blockchain')
      .setDescription('Supported: bsc, solana.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  try {
    const members = await message.guild.members.fetch();
    const eligibleUsers = members.filter(m => !m.user.bot && wallets[m.id]?.[chain]);
    if (eligibleUsers.size < numRecipients) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Users')
        .setDescription('Not enough eligible users with wallets.')
        .setColor(0xff0000)
        .setFooter({ text: config.name })
        .setTimestamp();
      message.reply({ embeds: [embed] });
      return;
    }

    const recipients = eligibleUsers.random(numRecipients);
    const amountPerUser = totalAmount / numRecipients;

    for (const recipient of recipients.values()) {
      const recipientAddress = wallets[recipient.id][chain].address || wallets[recipient.id][chain].publicKey;
      if (chain === 'bsc') {
        const tx = {
          from: botWallets.bsc.address,
          to: recipientAddress,
          value: web3.utils.toWei(amountPerUser.toString(), 'ether'),
          gas: 21000,
        };
        const signedTx = await web3.eth.accounts.signTransaction(tx, botWallets.bsc.privateKey);
        await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      }
    }

    const recipientNames = recipients.map(r => r.user.username).join(', ');
    const embed = new EmbedBuilder()
      .setTitle('🌧️ Rain Distributed')
      .setDescription(`Amount per user: ${amountPerUser.toFixed(4)} ${chain.toUpperCase()}\nRecipients: ${recipientNames}`)
      .setColor(0x00ff00)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Rain Error')
      .setDescription('An error occurred during the rain. Ensure the bot wallet is funded.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

async function handleBalance(message, args) {
  const userId = message.author.id;
  const option = args[0]?.toLowerCase();

  if (!wallets[userId]) {
    const embed = new EmbedBuilder()
      .setTitle('❌ No Wallets')
      .setDescription('You have no wallets. Generate one with !wallet <chain>')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const balances = {};

  try {
    if (wallets[userId].bsc) {
      const balanceWei = await web3.eth.getBalance(wallets[userId].bsc.address);
      balances.bsc = web3.utils.fromWei(balanceWei, 'ether');
    }
    if (wallets[userId].solana) {
      const balanceLamports = await solana.getBalance(new PublicKey(wallets[userId].solana.publicKey));
      balances.solana = balanceLamports / 1e9;
    }
  } catch (error) {
    console.error(error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Balance Check Failed')
      .setDescription('Unable to fetch balances. Try again later.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  let fields = [];
  if (option === 'all') {
    fields = [
      { name: 'BSC (BNB)', value: balances.bsc ? `${balances.bsc} BNB` : '0 BNB', inline: true },
      { name: 'Solana (SOL)', value: balances.solana ? `${balances.solana} SOL` : '0 SOL', inline: true }
    ];
  } else if (option === 'nonzero') {
    if (balances.bsc && parseFloat(ballets.bsc) > 0) fields.push({ name: 'BSC (BNB)', value: `${balances.bsc} BNB`, inline: true });
    if (balances.solana && parseFloat(ballets.solana) > 0) fields.push({ name: 'Solana (SOL)', value: `${balances.solana} SOL`, inline: true });
    if (fields.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📊 Balances')
        .setDescription('No balances found.')
        .setColor(0xffa500)
        .setFooter({ text: config.name })
        .setTimestamp();
      message.reply({ embeds: [embed] });
      return;
    }
  } else if (option === 'bsc' || option === 'solana') {
    const chain = option;
    if (!balances[chain]) {
      const embed = new EmbedBuilder()
        .setTitle('❌ No Wallet')
        .setDescription(`You have no ${chain.toUpperCase()} wallet. Generate one with ${config.prefix}wallet ${chain}`)
        .setColor(0xff0000)
        .setFooter({ text: config.name })
        .setTimestamp();
      message.reply({ embeds: [embed] });
      return;
    }
    fields = [{ name: `${chain.toUpperCase()} (${chain === 'bsc' ? 'BNB' : 'SOL'})`, value: `${balances[chain]} ${chain === 'bsc' ? 'BNB' : 'SOL'}`, inline: false }];
  } else {
    const embed = new EmbedBuilder()
      .setTitle('❓ Correct Usage')
      .setDescription(`Usage: ${config.prefix}balance <bsc|solana|all|nonzero>`)
      .setColor(0xffa500)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📊 Wallet Balances')
    .setDescription(`Balances for ${message.author.username}`)
    .addFields(...fields)
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

function handleCurrencies(message) {
  const embed = new EmbedBuilder()
    .setTitle('💰 Supported Currencies')
    .setDescription('The bot supports the following blockchains:')
    .addFields(
      { name: 'BSC (Binance Smart Chain)', value: 'Native token: BNB', inline: false },
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

async function handleAirdrop(message, args) {
  if (!message.member.permissions.has('Administrator')) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Access Denied')
      .setDescription('Only server administrators can use airdrop.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const chain = args[0]?.toLowerCase();
  const amount = parseFloat(args[1]);
  const numUsers = parseInt(args[2]);
  const minutes = parseInt(args[3]);

  if (!chain || !amount || !numUsers || !minutes || isNaN(amount) || isNaN(numUsers) || isNaN(minutes)) {
    const embed = new EmbedBuilder()
      .setTitle('❓ Correct Usage')
      .setDescription(`Usage: ${config.prefix}airdrop <chain> <amount> <numUsers> <minutes>`)
      .setColor(0xffa500)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  if (chain !== 'bsc' && chain !== 'solana') {
    const embed = new EmbedBuilder()
      .setTitle('❌ Unsupported Blockchain')
      .setDescription('Supported: bsc, solana.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const now = Date.now();
  const cutoff = now - minutes * 60000;
  const activeUsers = Object.keys(lastActive).filter(id => lastActive[id] > cutoff && wallets[id]?.[chain]);

  if (activeUsers.length < numUsers) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Insufficient Active Users')
      .setDescription(`Only ${activeUsers.length} active users with ${chain.toUpperCase()} wallets in the last ${minutes} minutes.`)
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  const selected = activeUsers.sort(() => Math.random() - 0.5).slice(0, numUsers);
  const recipients = selected.map(id => ({ id, address: wallets[id][chain].address || wallets[id][chain].publicKey }));

  try {
    for (const recipient of recipients) {
      if (chain === 'bsc') {
        const tx = {
          from: botWallets.bsc.address,
          to: recipient.address,
          value: web3.utils.toWei(amount.toString(), 'ether'),
          gas: 21000,
        };
        const signedTx = await web3.eth.accounts.signTransaction(tx, botWallets.bsc.privateKey);
        await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      }
    }

    const recipientNames = selected.map(id => `<@${id}>`).join(', ');
    const embed = new EmbedBuilder()
      .setTitle('🎁 Airdrop Completed')
      .setDescription(`Airdropped ${amount} ${chain.toUpperCase()} to ${numUsers} active users in the last ${minutes} minutes.\nRecipients: ${recipientNames}`)
      .setColor(0x00ff00)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Airdrop Failed')
      .setDescription('An error occurred during the airdrop. Ensure the bot wallet is funded.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

async function handleTip(message, args) {
  const discordId = message.author.id;
  const targetUser = message.mentions.users.first();
  const amount = parseFloat(args[1]);
  const chain = args[2]?.toLowerCase();

  if (!targetUser || !amount || !chain || isNaN(amount) || amount <= 0) {
    const embed = new EmbedBuilder()
      .setTitle('❓ Correct Usage')
      .setDescription(`Usage: ${config.prefix}tip @user <amount> <chain>`)
      .setColor(0xffa500)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  if (targetUser.id === discordId) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Invalid Tip')
      .setDescription('You cannot tip yourself.')
      .setColor(0xff0000)
      .setFooter({ text: config.name })
      .setTimestamp();
    message.reply({ embeds: [embed] });
    return;
  }

  if (!wallets[discordId] || !wallets[targetUser.id]) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Wallet Not Found')
      .setDescription('Both users must have wallets.')
      .setColor(0xff0000)
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
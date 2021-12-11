import {
  ArgsOf,
  ButtonComponent,
  Client,
  Discord,
  On,
  Slash,
  SlashGroup,
  SlashOption,
} from "discordx";
import {
  CommandInteraction,
  Guild,
  GuildMember,
  MessageEmbed,
} from "discord.js";
import { MyPlayer, MyQueue } from "./music";

@Discord()
@SlashGroup("music")
export class music {
  player;

  constructor() {
    this.player = new MyPlayer();
  }

  @On("voiceStateUpdate")
  voiceUpdate(
    [oldState, newState]: ArgsOf<"voiceStateUpdate">,
    client: Client
  ): void {
    const queue = this.player.getQueue(oldState.guild);

    if (
      !queue.isReady ||
      !queue.voiceChannelId ||
      (oldState.channelId != queue.voiceChannelId &&
        newState.channelId != queue.voiceChannelId) ||
      !queue.channel
    ) {
      return;
    }

    const channel =
      oldState.channelId === queue.voiceChannelId
        ? oldState.channel
        : newState.channel;

    if (!channel) {
      return;
    }

    const totalMembers = channel.members.filter((m) => !m.user.bot);

    if (queue.isPlaying && !totalMembers.size) {
      queue.pause();
      queue.channel.send(
        "> User們全部都離開了...為了節省能源，現在將暫停播放清單內裡的所有歌曲⏸️"
      );

      if (queue.timeoutTimer) {
        clearTimeout(queue.timeoutTimer);
      }

      queue.timeoutTimer = setTimeout(() => {
        queue.channel?.send(
          "> User明明跟我約好五分鐘內會到的...看不到User的人影...那平平子只能先離開了🥺"
        );
        queue.leave();
      }, 5 * 60 * 1000);
    } else if (queue.isPause && totalMembers.size) {
      if (queue.timeoutTimer) {
        clearTimeout(queue.timeoutTimer);
        queue.timeoutTimer = undefined;
      }
      queue.resume();
      queue.channel.send(
        "> 有新的User加入了！那麼，音樂繼續播放囉🎶"
      );
    }
  }

  validateControlInteraction(
    interaction: CommandInteraction,
    client: Client
  ): MyQueue | undefined {
    if (
      !interaction.guild ||
      !interaction.channel ||
      !(interaction.member instanceof GuildMember)
    ) {
      interaction.reply(
        "> User的要求目前暫時無法處理！請稍等一下後再試一次！⚡"
      );
      return;
    }

    const queue = this.player.getQueue(interaction.guild, interaction.channel);

    if (interaction.member.voice.channelId !== queue.voiceChannelId) {
      interaction.reply(
        "> User還沒加入語音房間喔~先加入一個語音房間，平平子才能為User服務！⚡"
      );

      setTimeout(() => interaction.deleteReply(), 15e3);
      return;
    }

    return queue;
  }

  @ButtonComponent("btn-next")
  async nextControl(
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = this.validateControlInteraction(interaction, client);
    if (!queue) {
      return;
    }
    queue.skip();
    await interaction.deferReply();
    interaction.deleteReply();
  }

  @ButtonComponent("btn-pause")
  async pauseControl(
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = this.validateControlInteraction(interaction, client);
    if (!queue) {
      return;
    }
    queue.isPause ? queue.resume() : queue.pause();
    await interaction.deferReply();
    interaction.deleteReply();
  }

  @ButtonComponent("btn-leave")
  async leaveControl(
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = this.validateControlInteraction(interaction, client);
    if (!queue) {
      return;
    }
    queue.leave();
    await interaction.deferReply();
    interaction.deleteReply();
  }

  @ButtonComponent("btn-repeat")
  async repeatControl(
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = this.validateControlInteraction(interaction, client);
    if (!queue) {
      return;
    }
    queue.setRepeat(!queue.repeat);
    await interaction.deferReply();
    interaction.deleteReply();
  }

  @ButtonComponent("btn-queue")
  queueControl(interaction: CommandInteraction, client: Client): void {
    const queue = this.validateControlInteraction(interaction, client);
    if (!queue) {
      return;
    }
    queue.view(interaction, client);
  }

  @ButtonComponent("btn-mix")
  async mixControl(
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = this.validateControlInteraction(interaction, client);
    if (!queue) {
      return;
    }
    queue.mix();
    await interaction.deferReply();
    interaction.deleteReply();
  }

  @ButtonComponent("btn-controls")
  async controlsControl(
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = this.validateControlInteraction(interaction, client);
    if (!queue) {
      return;
    }
    queue.updateControlMessage({ force: true });
    await interaction.deferReply();
    interaction.deleteReply();
  }

  async processJoin(
    interaction: CommandInteraction,
    client: Client
  ): Promise<MyQueue | undefined> {
    if (
      !interaction.guild ||
      !interaction.channel ||
      !(interaction.member instanceof GuildMember)
    ) {
      interaction.reply(
        "> User的要求目前暫時無法處理！請稍等一下後再試一次！⚡"
      );

      setTimeout(() => interaction.deleteReply(), 15e3);
      return;
    }

    if (
      !(interaction.member instanceof GuildMember) ||
      !interaction.member.voice.channel
    ) {
      interaction.reply("> User還沒加入語音房間喔~⚡");

      setTimeout(() => interaction.deleteReply(), 15e3);
      return;
    }

    await interaction.deferReply();
    const queue = this.player.getQueue(interaction.guild, interaction.channel);

    if (!queue.isReady) {
      queue.channel = interaction.channel;
      await queue.join(interaction.member.voice.channel);
    }

    return queue;
  }

  @Slash("play", { description: "從Youtube上播放歌曲" })
  async play(
    @SlashOption("song", { description: "歌曲名稱", required: true })
    songName: string,
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = await this.processJoin(interaction, client);
    if (!queue) {
      return;
    }
    const song = await queue.play(songName, { user: interaction.user });
    if (!song) {
      interaction.followUp("User~平平子找不到這首歌！再找一次試看看~？⚡");
    } else {
      const embed = new MessageEmbed();
      embed.setTitle("已加入播放清單");
      embed.setDescription(`已將這首歌加入目前播放清單⚡ **${song.title}****`);
      interaction.followUp({ embeds: [embed] });
    }
  }

  @Slash("playlist", { description: "播放一份播放清單" })
  async playlist(
    @SlashOption("playlist", { description: "播放清單名稱", required: true })
    playlistName: string,
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = await this.processJoin(interaction, client);
    if (!queue) {
      return;
    }
    const songs = await queue.playlist(playlistName, {
      user: interaction.user,
    });
    if (!songs) {
      interaction.followUp("The playlist could not be found");
    } else {
      const embed = new MessageEmbed();
      embed.setTitle("Enqueued");
      embed.setDescription(`Enqueued  **${songs.length}** songs from playlist`);
      interaction.followUp({ embeds: [embed] });
    }
  }

  @Slash("spotify", { description: "從Spotify連結播放(無須訂閱即可使用)" })
  async spotify(
    @SlashOption("link", { description: "Spotify連結", required: true })
    link: string,
    interaction: CommandInteraction,
    client: Client
  ): Promise<void> {
    const queue = await this.processJoin(interaction, client);
    if (!queue) {
      return;
    }
    const songs = await queue.spotify(link, { user: interaction.user });
    if (!songs) {
      interaction.followUp("User的Spotify連結似乎打錯了，找不到這首歌或是播放清單喔⚡");
    } else {
      const embed = new MessageEmbed();
      embed.setTitle("已加入播放清單");
      embed.setDescription(`已從Spotify將 **${songs.length}** 加入目前播放清單⚡`);
      interaction.followUp({ embeds: [embed] });
    }
  }

  validateInteraction(
    interaction: CommandInteraction,
    client: Client
  ): undefined | { guild: Guild; member: GuildMember; queue: MyQueue } {
    if (
      !interaction.guild ||
      !(interaction.member instanceof GuildMember) ||
      !interaction.channel
    ) {
      interaction.reply(
        "> User的要求目前暫時無法處理！請稍等一下後再試一次！⚡"
      );

      setTimeout(() => interaction.deleteReply(), 15e3);
      return;
    }

    if (!interaction.member.voice.channel) {
      interaction.reply(
        "> User還沒加入語音房間喔~先加入一個語音房間，平平子才能為User服務！⚡"
      );

      setTimeout(() => interaction.deleteReply(), 15e3);
      return;
    }

    const queue = this.player.getQueue(interaction.guild, interaction.channel);

    if (
      !queue.isReady ||
      interaction.member.voice.channel.id !== queue.voiceChannelId
    ) {
      interaction.reply(
        "> User還沒加入語音房間喔~先加入一個語音房間，平平子才能為User服務！⚡"
      );

      setTimeout(() => interaction.deleteReply(), 15e3);
      return;
    }

    return { guild: interaction.guild, member: interaction.member, queue };
  }

  @Slash("skip", { description: "切歌" })
  skip(interaction: CommandInteraction, client: Client): void {
    const validate = this.validateInteraction(interaction, client);
    if (!validate) {
      return;
    }

    const { queue } = validate;

    queue.skip();
    interaction.reply("> 已經跳過這首歌曲了⏭️");
  }

  @Slash("mix", { description: "mix tracks" })
  mix(interaction: CommandInteraction, client: Client): void {
    const validate = this.validateInteraction(interaction, client);
    if (!validate) {
      return;
    }

    const { queue } = validate;

    queue.mix();
    interaction.reply("> mixed current queue");
  }

  @Slash("pause", { description: "歌曲暫停" })
  pause(interaction: CommandInteraction, client: Client): void {
    const validate = this.validateInteraction(interaction, client);
    if (!validate) {
      return;
    }

    const { queue } = validate;

    if (queue.isPause) {
      interaction.reply("> 歌曲已經暫停⏸️");
      return;
    }

    queue.pause();
    interaction.reply("> 暫停播放⏸️");
  }

  @Slash("resume", { description: "繼續播放歌曲" })
  resume(interaction: CommandInteraction, client: Client): void {
    const validate = this.validateInteraction(interaction, client);
    if (!validate) {
      return;
    }

    const { queue } = validate;

    if (queue.isPlaying) {
      interaction.reply("> 已經在播放了喔▶️");
      return;
    }

    queue.resume();
    interaction.reply("> 繼續播放▶️");
  }

  @Slash("seek", { description: "seek music" })
  seek(
    @SlashOption("time", {
      description: "seek time in seconds",
      required: true,
    })
    time: number,
    interaction: CommandInteraction,
    client: Client
  ): void {
    const validate = this.validateInteraction(interaction, client);
    if (!validate) {
      return;
    }

    const { queue } = validate;

    if (!queue.isPlaying || !queue.currentTrack) {
      interaction.reply("> 目前沒有任何歌曲正在播放喔！");
      return;
    }

    const state = queue.seek(time * 1000);
    if (!state) {
      interaction.reply("> could not seek");
      return;
    }
    interaction.reply("> current music seeked");
  }

  @Slash("leave", { description: "停止播放" })
  leave(interaction: CommandInteraction, client: Client): void {
    const validate = this.validateInteraction(interaction, client);
    if (!validate) {
      return;
    }

    const { queue } = validate;
    queue.leave();
    interaction.reply("> User，音樂已經停止了~！");
  }
}

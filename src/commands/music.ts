import {
  Client,
  CommandInteraction,
  ContextMenuInteraction,
  Guild,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  TextBasedChannels,
} from "discord.js";
import { Pagination, PaginationResolver } from "@discordx/utilities";
import { Player, Queue } from "@discordx/music";

export class MyQueue extends Queue {
  lastControlMessage?: Message;
  timeoutTimer?: NodeJS.Timeout;
  lockUpdate = false;

  get playbackMilliseconds(): number {
    const track = this.currentTrack;
    if (
      !track ||
      !track.metadata.isYoutubeTrack() ||
      !track.metadata.info.duration
    ) {
      return 0;
    }

    return this.toMS(track.metadata.info.duration);
  }

  constructor(
    player: Player,
    guild: Guild,
    public channel?: TextBasedChannels
  ) {
    super(player, guild);
    setInterval(() => this.updateControlMessage(), 1e4);
    // empty constructor
  }

  public fromMS(duration: number): string {
    const seconds = Math.floor((duration / 1e3) % 60);
    const minutes = Math.floor((duration / 6e4) % 60);
    const hours = Math.floor(duration / 36e5);
    const secondsPad = `${seconds}`.padStart(2, "0");
    const minutesPad = `${minutes}`.padStart(2, "0");
    const hoursPad = `${hours}`.padStart(2, "0");
    return `${hours ? `${hoursPad}:` : ""}${minutesPad}:${secondsPad}`;
  }

  public toMS(duration: string): number {
    const milliseconds =
      duration
        .split(":")
        .reduceRight(
          (prev, curr, i, arr) =>
            prev + parseInt(curr) * Math.pow(60, arr.length - 1 - i),
          0
        ) * 1e3;

    return milliseconds ? milliseconds : 0;
  }

  private controlsRow(): MessageActionRow[] {
    const nextButton = new MessageButton()
      .setLabel("下一首歌")
      .setEmoji("⏭")
      .setStyle("PRIMARY")
      .setDisabled(!this.isPlaying)
      .setCustomId("btn-next");
    const pauseButton = new MessageButton()
      .setLabel(this.isPlaying ? "暫停" : "繼續")
      .setEmoji(this.isPlaying ? "⏸️" : "▶️")
      .setStyle("PRIMARY")
      .setCustomId("btn-pause");
    const stopButton = new MessageButton()
      .setLabel("停止播放")
      .setStyle("DANGER")
      .setCustomId("btn-leave");
    const repeatButton = new MessageButton()
      .setLabel("重複單曲")
      .setEmoji("🔂")
      .setDisabled(!this.isPlaying)
      .setStyle(this.repeat ? "DANGER" : "PRIMARY")
      .setCustomId("btn-repeat");
    const loopButton = new MessageButton()
      .setLabel("重複全部")
      .setEmoji("🔁")
      .setDisabled(!this.isPlaying)
      .setStyle(this.loop ? "DANGER" : "PRIMARY")
      .setCustomId("btn-loop");

    const row1 = new MessageActionRow().addComponents(
      stopButton,
      pauseButton,
      nextButton,
      repeatButton,
      loopButton
    );

    const queueButton = new MessageButton()
      .setLabel("播放清單")
      .setEmoji("🎵")
      .setStyle("PRIMARY")
      .setCustomId("btn-queue");
    const mixButton = new MessageButton()
      .setLabel("隨機播放")
      .setEmoji("🎛️")
      .setDisabled(!this.isPlaying)
      .setStyle("PRIMARY")
      .setCustomId("btn-mix");
    const controlsButton = new MessageButton()
      .setLabel("清除操作")
      .setEmoji("🔄")
      .setStyle("PRIMARY")
      .setCustomId("btn-controls");

    const row2 = new MessageActionRow().addComponents(
      queueButton,
      mixButton,
      controlsButton
    );
    return [row1, row2];
  }

  public async updateControlMessage(options?: {
    force?: boolean;
    text?: string;
  }): Promise<void> {
    if (this.lockUpdate) {
      return;
    }
    this.lockUpdate = true;
    const embed = new MessageEmbed();
    embed.setTitle("播放控制器⚡");
    const currentTrack = this.currentTrack;
    const nextTrack = this.nextTrack;
    if (!currentTrack) {
      if (this.lastControlMessage) {
        await this.lastControlMessage.delete();
        this.lastControlMessage = undefined;
      }
      this.lockUpdate = false;
      return;
    }
    const user = currentTrack.metadata.isYoutubeTrack()
      ? currentTrack.metadata.options?.user
      : currentTrack.metadata?.user;

    embed.addField(
      "正在播放⚡" +
        (this.size > 2 ? ` (Total: ${this.size} tracks queued)` : ""),
      `[${currentTrack.metadata.title}](${currentTrack.metadata.url ?? "NaN"})${
        user ? ` by ${user}` : ""
      }`
    );

    const progressBaroptions = {
      size: 15,
      arrow: "🔘",
      block: "━",
    };

    if (currentTrack.metadata.isYoutubeTrack()) {
      const { size, arrow, block } = progressBaroptions;
      const timeNow = this.playbackDuration;
      const timeTotal = this.playbackMilliseconds;

      const progress = Math.round((size * timeNow) / timeTotal);
      const emptyProgress = size - progress;

      const progressString =
        block.repeat(progress) + arrow + block.repeat(emptyProgress);

      const bar = (this.isPlaying ? "▶️" : "⏸️") + " " + progressString;
      const currentTime = this.fromMS(timeNow);
      const endTime = this.fromMS(timeTotal);
      const spacing = bar.length - currentTime.length - endTime.length;
      const time =
        "`" + currentTime + " ".repeat(spacing * 3 - 2) + endTime + "`";

      embed.addField(bar, time);
    }

    if (
      currentTrack.metadata.isYoutubeTrack() &&
      currentTrack.metadata.info.bestThumbnail.url
    ) {
      embed.setThumbnail(currentTrack.metadata.info.bestThumbnail.url);
    }

    embed.addField(
      "下一首",
      nextTrack ? `[${nextTrack.title}](${nextTrack.url})` : "沒有下一首歌了！"
    );

    const pMsg = {
      content: options?.text,
      embeds: [embed],
      components: [...this.controlsRow()],
    };

    if (!this.isReady && this.lastControlMessage) {
      await this.lastControlMessage.delete();
      this.lastControlMessage = undefined;
      this.lockUpdate = false;
      return;
    }

    try {
      if (!this.lastControlMessage || options?.force) {
        if (this.lastControlMessage) {
          await this.lastControlMessage.delete();
          this.lastControlMessage = undefined;
        }
        this.lastControlMessage = await this.channel?.send(pMsg);
      } else {
        await this.lastControlMessage.edit(pMsg);
      }
    } catch (err) {
      // ignore
      console.log(err);
    }

    this.lockUpdate = false;
  }

  public async view(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    client: Client
  ): Promise<void> {
    const currentTrack = this.currentTrack;
    if (!this.isReady || !currentTrack) {
      const pMsg = await interaction.reply({
        content: "> could not process queue atm, try later!",
        ephemeral: true,
      });
      if (pMsg instanceof Message) {
        setTimeout(() => pMsg.delete(), 3000);
      }
      return;
    }

    if (!this.size) {
      const pMsg = await interaction.reply(
        `> 正在播放 **${currentTrack.metadata.title}**`
      );
      if (pMsg instanceof Message) {
        setTimeout(() => pMsg.delete(), 1e4);
      }
      return;
    }

    const current = `> 正在播放清單 **${currentTrack.metadata.title}** 中的 ${
      this.size + 1
    }`;

    const pageOptions = new PaginationResolver((index, paginator) => {
      paginator.maxLength = this.size / 10;
      if (index > paginator.maxLength) {
        paginator.currentPage = 0;
      }

      const currentPage = paginator.currentPage;

      const queue = this.tracks
        .slice(currentPage * 10, currentPage * 10 + 10)
        .map(
          (track, sindex) =>
            `${currentPage * 10 + sindex + 1}. ${track.title}` +
            `${
              track.isYoutubeTrack() && track.info.duration
                ? ` (${track.info.duration})`
                : ""
            }`
        )
        .join("\n\n");

      return `${current}\n\`\`\`markdown\n${queue}\`\`\``;
    }, Math.round(this.size / 10));

    await new Pagination(interaction, pageOptions, {
      enableExit: true,
      onTimeout: (index, message) => {
        if (message.deletable) {
          message.delete();
        }
      },
      type: Math.round(this.size / 10) <= 5 ? "BUTTON" : "SELECT_MENU",
      time: 6e4,
    }).send();
  }
}

export class MyPlayer extends Player {
  constructor() {
    super();

    this.on<MyQueue, "onStart">("onStart", ([queue]) => {
      queue.updateControlMessage({ force: true });
    });

    this.on<MyQueue, "onFinishPlayback">("onFinishPlayback", ([queue]) => {
      queue.leave();
    });

    this.on<MyQueue, "onPause">("onPause", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onResume">("onResume", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onError">("onError", ([queue, err]) => {
      queue.updateControlMessage({
        force: true,
        text: `Error: ${err.message}`,
      });
    });

    this.on<MyQueue, "onFinish">("onFinish", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onLoop">("onLoop", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onRepeat">("onRepeat", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onSkip">("onSkip", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onTrackAdd">("onTrackAdd", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onLoopEnabled">("onLoopEnabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onLoopDisabled">("onLoopDisabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onRepeatEnabled">("onRepeatEnabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onRepeatDisabled">("onRepeatDisabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onMix">("onMix", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onVolumeUpdate">("onVolumeUpdate", ([queue]) => {
      queue.updateControlMessage();
    });
  }

  getQueue(guild: Guild, channel?: TextBasedChannels): MyQueue {
    return super.queue<MyQueue>(guild, () => new MyQueue(this, guild, channel));
  }
}

import { v4 as uuidv4 } from "uuid";
import { User } from "@server/models";
import { uploadToS3FromUrl } from "@server/utils/s3";
import BaseTask, { TaskPriority } from "./BaseTask";

type Props = {
  /* The userId to operate on */
  userId: string;
  /* The original avatarUrl from the SSO provider */
  avatarUrl: string;
};

/**
 * A task that uploads the provided avatarUrl to S3 storage and updates the
 * user's record with the new url.
 */
export default class UploadUserAvatarTask extends BaseTask<Props> {
  public async perform(props: Props) {
    const user = await User.findByPk(props.userId, {
      rejectOnEmpty: true,
    });

    const avatarUrl = await uploadToS3FromUrl(
      props.avatarUrl,
      `avatars/${user.id}/${uuidv4()}`,
      "public-read"
    );

    if (avatarUrl) {
      await user.update({ avatarUrl });
    }
  }

  public get options() {
    return {
      attempts: 3,
      priority: TaskPriority.Normal,
    };
  }
}

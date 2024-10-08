import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { Model } from 'mongoose';
import { hashPasswordHelper } from '@/helpers/utils';
import aqp from 'api-query-params';
import mongoose from "mongoose";
import { RegisterDto } from '@/auth/dto/register.dto';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name)
  private userModel: Model<User>,
    private readonly mailerService: MailerService
  ) { }

  isEmailExist = async (email: String) => {
    const user = await this.userModel.exists({ email })
    if (user) return true
    return false
  }

  async create(createUserDto: CreateUserDto) {
    const { name, email, password } = createUserDto

    //check email
    const isExist = await this.isEmailExist(email);
    if (isExist) {
      throw new BadRequestException(`Email đã tồn tại: ${email}. Vui lòng sử dụng email khác.`)
    }

    //hash password with bcrypt
    const hashPassword = await hashPasswordHelper(password);
    const user = await this.userModel.create({
      name, email, password: hashPassword
    })

    return {
      _id: user._id
    }
  }

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    if (filter.current) delete filter.current;
    if (filter.pageSize) delete filter.pageSize;

    if (!current) current = 1
    if (!pageSize) pageSize = 10

    const totalItems = (await this.userModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / pageSize);

    const skip = (current - 1) * pageSize;

    const results = await this.userModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .select('-password')
      .sort(sort as any);

    return { results, totalPages };
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  async findByEmail(email: string) {
    return await this.userModel.findOne({ email })
  }

  async update(updateUserDto: UpdateUserDto) {
    return await this.userModel.updateOne(
      {
        _id: updateUserDto._id,
        name: updateUserDto.name,
        phone: updateUserDto.phone,
        address: updateUserDto.address,
        image: updateUserDto.image
      },
      // {...updateUserDto}
    )
  }

  async remove(_id: string) {
    if (mongoose.isValidObjectId(_id)) {
      return this.userModel.deleteOne({ _id })
    }
    throw new BadRequestException('Id không đúng định dạng')
  }

  async handleRegister(registerDto: RegisterDto) {
    const { name, email, password } = registerDto

    //check email
    const isExist = await this.isEmailExist(email);
    if (isExist) {
      throw new BadRequestException(`Email đã tồn tại: ${email}. Vui lòng sử dụng email khác.`)
    }

    //hash password with bcrypt
    const hashPassword = await hashPasswordHelper(password);
    const codeId = uuidv4();
    const user = await this.userModel.create({
      name, email, password: hashPassword, isActive: false, codeId: codeId, codeExpired: dayjs().add(60, 'minutes')
    })

    this.sendEmail(user.email, user?.name ?? user?.email, codeId);

    return {
      _id: user._id
    }
  }

  sendEmail(email: string, name: string, codeId: string) {
    this.mailerService.sendMail({
      to: email, // list of receivers
      subject: 'Activate your account', // Subject line
      template: 'register',
      context: {
        name: name,
        activationCode: codeId
      }
    })
  }
}
